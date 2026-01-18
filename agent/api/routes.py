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

# =============================================================================
# Problem Bank
# =============================================================================

def load_problems() -> dict[str, ProblemInfo]:
    """Load problems from JSON file."""
    try:
        json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "problems.json")
        with open(json_path, "r") as f:
            problems_data = json.load(f)
        
        bank = {}
        for p in problems_data:
            bank[p["id"]] = ProblemInfo(
                id=p["id"],
                title=p["title"],
                difficulty=p["difficulty"],
                prompt=p["prompt"],
                starter_code=p["starter_code"],
                optimal_approach=p["optimal_approach"],
                constraints=p["constraints"],
                test_cases=p["test_cases"]
            )
        return bank
    except Exception as e:
        print(f"Error loading problems: {e}")
        return {}

PROBLEM_BANK: dict[str, ProblemInfo] = load_problems()


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/token", response_model=TokenResponse)
async def get_token(session_id: str, candidate_name: str) -> TokenResponse:
    """Generate a LiveKit access token for the session."""
    settings = get_settings()
    
    if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(status_code=500, detail="LiveKit not configured")

    # Create token using builder pattern (new SDK API)
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(candidate_name)
        .with_name(candidate_name)
        .with_grants(api.VideoGrants(room_join=True, room=session_id))
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


class ChatRequest(BaseModel):
    """Chat message from candidate."""
    message: str
    code: str | None = None


class ChatResponse(BaseModel):
    """AI response to candidate."""
    response: str


@router.post("/interviews/{session_id}/chat", response_model=ChatResponse)
async def chat_with_interviewer(session_id: str, request: ChatRequest) -> ChatResponse:
    """Send a message to the AI interviewer and get a response."""
    import anthropic

    state = _sessions.get(session_id)
    if not state:
        # For demo mode, create a temporary context
        problem = PROBLEM_BANK.get("two_sum")
        state = {
            "problem": problem,
            "candidate_name": "Candidate",
            "conversation_history": [],
        }

    problem = state.get("problem", PROBLEM_BANK.get("two_sum"))

    # Build context for AI
    system_prompt = f"""You are Sarah, a friendly and encouraging technical interviewer at a top tech company.
You're conducting a coding interview for the "{problem['title']}" problem ({problem['difficulty']}).

Problem: {problem['prompt']}

Your role:
- Be conversational, warm, and supportive
- Give hints when asked, but don't give away the solution
- Encourage the candidate when they're on the right track
- Ask clarifying questions about their approach
- Keep responses concise (2-3 sentences max)
- If they share code, comment on their approach

Current code the candidate is working on:
{request.code or "No code yet"}
"""

    try:
        settings = get_settings()
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # Get conversation history
        messages = []
        for msg in state.get("conversation_history", [])[-6:]:  # Last 6 messages for context
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        # Add current message
        messages.append({"role": "user", "content": request.message})

        response = client.messages.create(
            model="claude-3-5-haiku-20241022",  # Fast model for chat
            max_tokens=150,
            system=system_prompt,
            messages=messages
        )

        ai_response = response.content[0].text

        # Update conversation history
        if session_id in _sessions:
            _sessions[session_id].setdefault("conversation_history", [])
            _sessions[session_id]["conversation_history"].append({"role": "user", "content": request.message})
            _sessions[session_id]["conversation_history"].append({"role": "assistant", "content": ai_response})

        return ChatResponse(response=ai_response)

    except Exception as e:
        print(f"Chat error: {e}")
        # Fallback response if API fails
        return ChatResponse(response="I'm having trouble connecting. Could you repeat that?")


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
    p.join(timeout=5.0) # 5 second timeout
    
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
