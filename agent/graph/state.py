"""
ARETE Interview State
Defines the state schema for LangGraph interview workflow.
"""

from typing import TypedDict, Annotated
from datetime import datetime
import operator


class ProblemInfo(TypedDict):
    """LeetCode problem metadata."""
    id: str
    title: str
    difficulty: str  # Easy, Medium, Hard
    prompt: str
    starter_code: str
    optimal_approach: str
    test_cases: list[dict]
    constraints: list[str]


class InterviewScores(TypedDict):
    """Interview scoring breakdown."""
    correctness: int  # 0-10
    optimization: int  # 0-10
    communication: int  # 0-10
    problem_solving: int  # 0-10


class FairnessResult(TypedDict):
    """Fairness monitor output."""
    bias_detected: bool
    fairness_score: float
    flags: list[str]
    normalized_scores: InterviewScores
    recommendation: str
    confidence: float
    reasoning: str


class ConversationMessage(TypedDict):
    """Single conversation turn."""
    role: str  # "interviewer" or "candidate"
    content: str
    timestamp: str


class CodeSubmission(TypedDict):
    """Code submission with execution results."""
    code: str
    timestamp: str
    test_results: dict | None
    passed: bool


class InterviewState(TypedDict, total=False):
    """
    Complete interview state for LangGraph workflow.
    
    This state is passed between agents and accumulates
    throughout the interview session.
    """
    # Session metadata
    session_id: str
    candidate_name: str
    started_at: str
    ended_at: str | None
    
    # Problem configuration
    problem: ProblemInfo
    
    # Live coding state
    code_snapshot: str
    code_history: Annotated[list[str], operator.add]  # Accumulated snapshots
    last_code_change_at: str | None
    
    # Conversation
    conversation_history: Annotated[list[ConversationMessage], operator.add]
    
    # Code submissions
    code_submissions: Annotated[list[CodeSubmission], operator.add]
    
    # Interviewer agent outputs
    current_analysis: str | None  # Latest code analysis
    hints_given: int
    encouragements_given: int
    interviewer_notes: str | None
    
    # Scoring (from interviewer)
    raw_scores: InterviewScores | None
    
    # Fairness agent outputs
    fairness_result: FairnessResult | None
    
    # Final outputs
    final_recommendation: str | None  # STRONG HIRE, HIRE, etc.
    interview_complete: bool


def create_initial_state(
    session_id: str,
    candidate_name: str,
    problem: ProblemInfo,
) -> InterviewState:
    """Create initial interview state."""
    return InterviewState(
        session_id=session_id,
        candidate_name=candidate_name,
        started_at=datetime.now().isoformat(),
        ended_at=None,
        problem=problem,
        code_snapshot=problem["starter_code"],
        code_history=[],
        last_code_change_at=None,
        conversation_history=[],
        code_submissions=[],
        current_analysis=None,
        hints_given=0,
        encouragements_given=0,
        interviewer_notes=None,
        raw_scores=None,
        fairness_result=None,
        final_recommendation=None,
        interview_complete=False,
    )
