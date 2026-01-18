"""
ARETE Interview Orchestrator

LangGraph workflow that coordinates the Interviewer and Fairness agents.
Manages interview state transitions and session lifecycle.
"""

from datetime import datetime
from typing import Any
from langgraph.graph import StateGraph, START, END

from .state import InterviewState, ProblemInfo, create_initial_state, ConversationMessage
from ..agents.interviewer import InterviewerAgent
from ..agents.fairness import FairnessAgent
from ..events import log_event


# Global agent instances (cached)
_interviewer: InterviewerAgent | None = None
_fairness: FairnessAgent | None = None


def get_interviewer() -> InterviewerAgent:
    """Get or create interviewer agent instance."""
    global _interviewer
    if _interviewer is None:
        _interviewer = InterviewerAgent()
    return _interviewer


def get_fairness_agent() -> FairnessAgent:
    """Get or create fairness agent instance."""
    global _fairness
    if _fairness is None:
        _fairness = FairnessAgent()
    return _fairness


def interviewer_node(state: InterviewState) -> dict[str, Any]:
    """
    LangGraph node for the interviewer agent.
    
    Handles problem presentation, code analysis, and final scoring.
    """
    interviewer = get_interviewer()
    
    # Check if this is the final scoring phase
    if state.get("interview_complete") and not state.get("raw_scores"):
        # Get last submission results
        submissions = state.get("code_submissions", [])
        test_results = submissions[-1].get("test_results", {}) if submissions else {}
        
        # Score the solution
        scores, notes = interviewer.score_solution(state, test_results)
        
        return {
            "raw_scores": dict(scores),
            "interviewer_notes": notes,
            "ended_at": datetime.now().isoformat(),
        }
    
    # Normal flow: present problem if first time
    if not state.get("conversation_history"):
        message = interviewer.present_problem(state)
        
        return {
            "conversation_history": [ConversationMessage(
                role="interviewer",
                content=message,
                timestamp=datetime.now().isoformat(),
            )]
        }
    
    return {}


def fairness_node(state: InterviewState) -> dict[str, Any]:
    """
    LangGraph node for the fairness agent.
    
    Runs after interview is complete to analyze for bias.
    """
    fairness = get_fairness_agent()
    
    # Only run if interview is complete and has scores
    if not state.get("raw_scores"):
        return {}
    
    result = fairness.analyze_interview(state)
    
    # Determine final recommendation
    overall = (
        result["normalized_scores"]["correctness"] +
        result["normalized_scores"]["optimization"] +
        result["normalized_scores"]["communication"] +
        result["normalized_scores"]["problem_solving"]
    ) / 4
    
    return {
        "fairness_result": result,
        "final_recommendation": result["recommendation"],
    }


def should_continue(state: InterviewState) -> str:
    """
    Routing function: determines next node based on state.
    """
    if state.get("interview_complete") and state.get("raw_scores"):
        # Interview scored, run fairness analysis
        return "fairness"
    elif state.get("interview_complete"):
        # Interview done but not scored yet
        return "interviewer"
    else:
        # Interview still in progress
        return END


def create_interview_graph() -> StateGraph:
    """
    Create the LangGraph workflow for interviews.
    
    Flow:
        START → interviewer (present problem)
        ... (real-time code snapshots handled outside graph) ...
        (interview ends) → interviewer (scoring) → fairness → END
    """
    graph = StateGraph(InterviewState)
    
    # Add nodes
    graph.add_node("interviewer", interviewer_node)
    graph.add_node("fairness", fairness_node)
    
    # Add edges
    graph.add_edge(START, "interviewer")
    graph.add_conditional_edges(
        "interviewer",
        should_continue,
        {
            "fairness": "fairness",
            "interviewer": "interviewer",
            END: END,
        }
    )
    graph.add_edge("fairness", END)
    
    return graph


def run_interview(
    session_id: str,
    candidate_name: str,
    problem: ProblemInfo,
) -> InterviewState:
    """
    Start a new interview session.
    
    Returns initial state after problem presentation.
    """
    # Create initial state
    state = create_initial_state(session_id, candidate_name, problem)
    
    # Log session start
    log_event(
        "SESSION_START",
        session_id,
        {
            "candidate_name": candidate_name,
            "problem_id": problem["id"],
            "problem_title": problem["title"],
        }
    )
    
    # Run graph to present problem
    graph = create_interview_graph()
    compiled = graph.compile()
    
    result = compiled.invoke(state)
    
    return result


def process_code_snapshot(
    state: InterviewState,
    new_code: str,
) -> tuple[InterviewState, str | None]:
    """
    Process a code snapshot and get agent response if any.
    
    Returns:
        Tuple of (updated state, agent message or None)
    """
    interviewer = get_interviewer()
    
    # Analyze the code
    action, message = interviewer.analyze_code(state, new_code)
    
    # Update state
    updates: dict[str, Any] = {
        "code_snapshot": new_code,
        "last_code_change_at": datetime.now().isoformat(),
        "code_history": [new_code],
    }
    
    if action == "HINT":
        updates["hints_given"] = state.get("hints_given", 0) + 1
        updates["conversation_history"] = [ConversationMessage(
            role="interviewer",
            content=message,
            timestamp=datetime.now().isoformat(),
        )]
    elif action == "ENCOURAGE":
        updates["encouragements_given"] = state.get("encouragements_given", 0) + 1
        updates["conversation_history"] = [ConversationMessage(
            role="interviewer",
            content=message,
            timestamp=datetime.now().isoformat(),
        )]
    elif action == "PROMPT":
        updates["hints_given"] = state.get("hints_given", 0) + 1
        updates["conversation_history"] = [ConversationMessage(
            role="interviewer",
            content=message,
            timestamp=datetime.now().isoformat(),
        )]
    
    # Merge updates into state
    new_state = {**state, **updates}
    
    # Handle list concatenation for Annotated fields
    if "conversation_history" in updates:
        new_state["conversation_history"] = (
            state.get("conversation_history", []) + updates["conversation_history"]
        )
    if "code_history" in updates:
        new_state["code_history"] = (
            state.get("code_history", []) + updates["code_history"]
        )
    
    return new_state, message


def finish_interview(state: InterviewState, test_results: dict) -> InterviewState:
    """
    Complete the interview, run scoring and fairness analysis.
    
    Returns:
        Final state with all scores and recommendations
    """
    # Mark interview as complete
    state["interview_complete"] = True
    
    # Add final submission
    state["code_submissions"] = state.get("code_submissions", []) + [{
        "code": state["code_snapshot"],
        "timestamp": datetime.now().isoformat(),
        "test_results": test_results,
        "passed": test_results.get("failed", 1) == 0,
    }]
    
    # Log session end
    log_event(
        "SESSION_END",
        state["session_id"],
        {"test_results": test_results}
    )
    
    # Run full graph to completion
    graph = create_interview_graph()
    compiled = graph.compile()
    
    result = compiled.invoke(state)
    
    return result
