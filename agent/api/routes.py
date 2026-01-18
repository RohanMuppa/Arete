"""
ARETE REST API Routes

Endpoints for interview management, code execution, and results retrieval.
"""

import uuid
import multiprocessing
from datetime import datetime
from typing import Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..graph.state import ProblemInfo, InterviewState
from ..graph.orchestrator import run_interview, process_code_snapshot, finish_interview
from ..events import get_session_events, get_session_transcript, log_event
from ..config import get_settings
from livekit import api
import os
import json


router = APIRouter(prefix="/api/v1", tags=["interviews"])


# In-memory session store (upgrade to Redis in production)
_sessions: dict[str, InterviewState] = {}


# =============================================================================
# Request/Response Models
# =============================================================================

class StartInterviewRequest(BaseModel):
    """Request to start a new interview session."""
    candidate_name: str = Field(..., min_length=1, max_length=100)
    problem_id: str = Field(..., min_length=1)


class StartInterviewResponse(BaseModel):
    """Response with new session details."""
    session_id: str
    candidate_name: str
    problem_title: str
    starter_code: str
    welcome_message: str


class CodeSnapshotRequest(BaseModel):
    """Code update from the editor."""
    code: str
    cursor_position: int | None = None


class CodeSnapshotResponse(BaseModel):
    """Agent response to code snapshot."""
    has_response: bool
    message: str | None = None
    action: str | None = None


class RunCodeRequest(BaseModel):
    """Request to execute code."""
    code: str


class RunCodeResponse(BaseModel):
    """Code execution results."""
    passed: int
    failed: int
    total: int
    details: list[dict[str, Any]]
    stderr: str | None = None


class SubmitSolutionRequest(BaseModel):
    """Final solution submission."""
    code: str


class InterviewReportResponse(BaseModel):
    """Final interview report."""
    session_id: str
    candidate_name: str
    problem_title: str
    duration_minutes: int
    scores: dict[str, int]
    overall_score: float
    recommendation: str
    fairness: dict[str, Any]
    transcript: list[dict[str, Any]]


class SessionStatusResponse(BaseModel):
    """Current session status."""
    session_id: str
    is_complete: bool
    code_snapshot: str
    hints_given: int
    elapsed_minutes: int


class TokenResponse(BaseModel):
    """LiveKit access token."""
    token: str
    identity: str
    room_name: str


# =============================================================================
# Problem Bank (Demo data)
# =============================================================================

PROBLEM_BANK: dict[str, ProblemInfo] = {
    "two_sum": ProblemInfo(
        id="two_sum",
        title="Two Sum",
        difficulty="Easy",
        prompt="""Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.""",
        starter_code="""def twoSum(nums: list[int], target: int) -> list[int]:
    # Your code here
    pass""",
        optimal_approach="Use a hash map to store seen values and their indices. O(n) time, O(n) space.",
        constraints=[
            "2 <= nums.length <= 10^4",
            "-10^9 <= nums[i] <= 10^9",
            "-10^9 <= target <= 10^9",
            "Only one valid answer exists."
        ],
        test_cases=[
            {"input": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
            {"input": {"nums": [3, 2, 4], "target": 6}, "expected": [1, 2]},
            {"input": {"nums": [3, 3], "target": 6}, "expected": [0, 1]},
        ]
    ),
    "merge_intervals": ProblemInfo(
        id="merge_intervals",
        title="Merge Intervals",
        difficulty="Medium",
        prompt="""Given an array of intervals where intervals[i] = [start, end], merge all overlapping intervals and return an array of non-overlapping intervals.""",
        starter_code="""def merge(intervals: list[list[int]]) -> list[list[int]]:
    # Your code here
    pass""",
        optimal_approach="Sort by start time, then merge overlaps. O(n log n) time.",
        constraints=[
            "1 <= intervals.length <= 10^4",
            "intervals[i].length == 2",
            "0 <= start <= end <= 10^4"
        ],
        test_cases=[
            {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}, "expected": [[1,6],[8,10],[15,18]]},
            {"input": {"intervals": [[1,4],[4,5]]}, "expected": [[1,5]]},
            {"input": {"intervals": [[1,4],[2,3]]}, "expected": [[1,4]]},
        ]
    ),
    "valid_parentheses": ProblemInfo(
        id="valid_parentheses",
        title="Valid Parentheses",
        difficulty="Easy",
        prompt="""Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.""",
        starter_code="""def isValid(s: str) -> bool:
    # Your code here
    pass""",
        optimal_approach="Use a stack. Push open brackets, pop and match for close brackets. O(n) time.",
        constraints=[
            "1 <= s.length <= 10^4",
            "s consists of parentheses only '()[]{}'"
        ],
        test_cases=[
            {"input": {"s": "()"}, "expected": True},
            {"input": {"s": "()[]{}"}, "expected": True},
            {"input": {"s": "(]"}, "expected": False},
            {"input": {"s": "([)]"}, "expected": False},
        ]
    ),
}


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/token", response_model=TokenResponse)
async def get_token(session_id: str, candidate_name: str) -> TokenResponse:
    """Generate a LiveKit access token for the session."""
    settings = get_settings()
    
    if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(status_code=500, detail="LiveKit not configured")

    # Grant access to the room
    grant = api.VideoGrants(room_join=True, room=session_id)
    
    # Create token
    token = api.AccessToken(
        settings.livekit_api_key,
        settings.livekit_api_secret,
        grant=grant,
        identity=candidate_name,
        name=candidate_name,
    )
    
    return TokenResponse(
        token=token.to_jwt(),
        identity=candidate_name,
        room_name=session_id
    )

@router.post("/interviews", response_model=StartInterviewResponse)
async def start_interview(request: StartInterviewRequest) -> StartInterviewResponse:
    """Start a new interview session."""
    # Get problem
    problem = PROBLEM_BANK.get(request.problem_id)
    if not problem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem '{request.problem_id}' not found. Available: {list(PROBLEM_BANK.keys())}"
        )
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    # Initialize interview
    state = run_interview(session_id, request.candidate_name, problem)
    
    # Store session
    _sessions[session_id] = state
    
    # Get welcome message from conversation history
    welcome = ""
    if state.get("conversation_history"):
        welcome = state["conversation_history"][0]["content"]
    
    return StartInterviewResponse(
        session_id=session_id,
        candidate_name=request.candidate_name,
        problem_title=problem["title"],
        starter_code=problem["starter_code"],
        welcome_message=welcome,
    )


@router.get("/interviews/{session_id}", response_model=SessionStatusResponse)
async def get_interview_status(session_id: str) -> SessionStatusResponse:
    """Get current interview session status."""
    state = _sessions.get(session_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found"
        )
    
    # Calculate elapsed time
    started = datetime.fromisoformat(state["started_at"])
    elapsed = int((datetime.now() - started).total_seconds() / 60)
    
    return SessionStatusResponse(
        session_id=session_id,
        is_complete=state.get("interview_complete", False),
        code_snapshot=state.get("code_snapshot", ""),
        hints_given=state.get("hints_given", 0),
        elapsed_minutes=elapsed,
    )


@router.post("/interviews/{session_id}/code", response_model=CodeSnapshotResponse)
async def submit_code_snapshot(
    session_id: str, 
    request: CodeSnapshotRequest
) -> CodeSnapshotResponse:
    """Submit a code snapshot for analysis."""
    state = _sessions.get(session_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found"
        )
    
    if state.get("interview_complete"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview already completed"
        )
    
    # Log code snapshot event
    log_event(
        "CODE_SNAPSHOT",
        session_id,
        {"code": request.code, "cursor": request.cursor_position}
    )
    
    # Process with agent
    new_state, message = process_code_snapshot(state, request.code)
    
    # Update session
    _sessions[session_id] = new_state
    
    return CodeSnapshotResponse(
        has_response=message is not None,
        message=message,
        action="hint" if message else None,
    )


@router.post("/interviews/{session_id}/run", response_model=RunCodeResponse)
async def run_code(session_id: str, request: RunCodeRequest) -> RunCodeResponse:
    """Execute candidate code against test cases."""
    state = _sessions.get(session_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found"
        )
    
    problem = state["problem"]
    
    # Execute code against test cases
    result = _execute_code(request.code, problem)
    
    # Log event
    log_event(
        "RUN_RESULT",
        session_id,
        result
    )
    
    return RunCodeResponse(**result)


@router.post("/interviews/{session_id}/submit", response_model=InterviewReportResponse)
async def submit_solution(
    session_id: str, 
    request: SubmitSolutionRequest
) -> InterviewReportResponse:
    """Submit final solution and get interview report."""
    state = _sessions.get(session_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found"
        )
    
    if state.get("interview_complete"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview already completed"
        )
    
    # Run final tests
    problem = state["problem"]
    test_results = _execute_code(request.code, problem)
    
    # Update code snapshot
    state["code_snapshot"] = request.code
    
    # Complete interview (runs scoring + fairness)
    final_state = finish_interview(state, test_results)
    
    # Update session
    _sessions[session_id] = final_state
    
    # Calculate duration
    started = datetime.fromisoformat(final_state["started_at"])
    ended = datetime.fromisoformat(final_state.get("ended_at") or datetime.now().isoformat())
    duration = int((ended - started).total_seconds() / 60)
    
    # Get scores
    fairness_result = final_state.get("fairness_result", {})
    scores = fairness_result.get("normalized_scores", final_state.get("raw_scores", {}))
    
    overall = sum(scores.values()) / len(scores) if scores else 0
    
    return InterviewReportResponse(
        session_id=session_id,
        candidate_name=final_state["candidate_name"],
        problem_title=final_state["problem"]["title"],
        duration_minutes=duration,
        scores=scores,
        overall_score=round(overall, 1),
        recommendation=final_state.get("final_recommendation", "PENDING"),
        fairness={
            "bias_detected": fairness_result.get("bias_detected", False),
            "fairness_score": fairness_result.get("fairness_score", 0),
            "flags": fairness_result.get("flags", []),
        },
        transcript=get_session_transcript(session_id),
    )


@router.get("/interviews/{session_id}/report", response_model=InterviewReportResponse)
async def get_interview_report(session_id: str) -> InterviewReportResponse:
    """Get final interview report for a completed session."""
    state = _sessions.get(session_id)
    
    # helper to load from disk if missing
    if not state:
        try:
            filename = f"session_{session_id}.json"
            if os.path.exists(filename):
                with open(filename, "r") as f:
                    state = json.load(f)
        except Exception:
            pass

    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found"
        )
    
    if not state.get("interview_complete"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview not yet completed"
        )
    
    # Calculate duration
    started = datetime.fromisoformat(state["started_at"])
    ended = datetime.fromisoformat(state.get("ended_at") or datetime.now().isoformat())
    duration = int((ended - started).total_seconds() / 60)
    
    # Get scores
    fairness_result = state.get("fairness_result", {})
    scores = fairness_result.get("normalized_scores", state.get("raw_scores", {}))
    
    overall = sum(scores.values()) / len(scores) if scores else 0
    
    return InterviewReportResponse(
        session_id=session_id,
        candidate_name=state["candidate_name"],
        problem_title=state["problem"]["title"],
        duration_minutes=duration,
        scores=scores,
        overall_score=round(overall, 1),
        recommendation=state.get("final_recommendation", "PENDING"),
        fairness={
            "bias_detected": fairness_result.get("bias_detected", False),
            "fairness_score": fairness_result.get("fairness_score", 0),
            "flags": fairness_result.get("flags", []),
        },
        transcript=get_session_transcript(session_id),
    )


@router.get("/problems")
async def list_problems() -> list[dict[str, str]]:
    """List available problems."""
    return [
        {"id": p["id"], "title": p["title"], "difficulty": p["difficulty"]}
        for p in PROBLEM_BANK.values()
    ]


# =============================================================================
# Helper Functions
# =============================================================================

def _worker_entry(code: str, test_cases: list[dict], q: multiprocessing.Queue):
    """Worker process for code execution."""
    result = {
        "passed": 0,
        "failed": 0,
        "total": len(test_cases),
        "details": [],
        "stderr": None,
    }
    
    try:
        # Create namespace and exec code
        namespace: dict[str, Any] = {}
        exec(code, namespace)
        
        # Find the function (assumes first function defined)
        func_name = None
        for name, obj in namespace.items():
            if callable(obj) and not name.startswith("_"):
                func_name = name
                break
        
        if not func_name:
            result["stderr"] = "No function defined"
            q.put(result)
            return
        
        func = namespace[func_name]
        
        # Run test cases
        for i, tc in enumerate(test_cases):
            try:
                # Handle different input formats
                if isinstance(tc["input"], dict):
                    actual = func(**tc["input"])
                else:
                    actual = func(tc["input"])
                
                expected = tc["expected"]
                
                # Compare (handle list order for some problems)
                if isinstance(expected, list) and isinstance(actual, list):
                    passed = sorted(map(str, actual)) == sorted(map(str, expected)) or actual == expected
                else:
                    passed = actual == expected
                
                if passed:
                    result["passed"] += 1
                else:
                    result["failed"] += 1
                    result["details"].append({
                        "case": i + 1,
                        "input": tc["input"],
                        "expected": expected,
                        "actual": actual,
                    })
            except Exception as e:
                result["failed"] += 1
                result["details"].append({
                    "case": i + 1,
                    "input": tc["input"],
                    "error": str(e),
                })
    except Exception as e:
        result["stderr"] = str(e)
    
    q.put(result)


def _execute_code(code: str, problem: ProblemInfo) -> dict[str, Any]:
    """
    Execute candidate code against test cases with timeout.
    
    Runs in a separate process to allow termination of infinite loops.
    """
    q = multiprocessing.Queue()
    p = multiprocessing.Process(target=_worker_entry, args=(code, problem["test_cases"], q))
    p.start()
    p.join(timeout=2.0) # 2 second timeout
    
    if p.is_alive():
        p.terminate()
        p.join()
        return {
            "passed": 0,
            "failed": len(problem["test_cases"]),
            "total": len(problem["test_cases"]),
            "details": [],
            "stderr": "Timeout: Code execution exceeded 2 seconds."
        }
    
    if not q.empty():
        return q.get()
    
    return {
        "passed": 0,
        "failed": len(problem["test_cases"]),
        "total": len(problem["test_cases"]),
        "details": [],
        "stderr": "Execution failed (Process crashed)"
    }
