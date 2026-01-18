"""
ARETE Technical Interviewer Agent

Agent 1: Conducts live technical interviews, analyzes code in real-time,
provides contextual hints, and scores solutions.

Uses Claude 3.5 Sonnet via OpenRouter.
"""

from datetime import datetime
from typing import Literal
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate

from ..config import get_settings
from ..graph.state import InterviewState, ConversationMessage, InterviewScores
from ..events import log_event, EventType


# Analysis action types
AnalysisAction = Literal["IGNORE", "HINT", "ENCOURAGE", "PROMPT"]


INTERVIEWER_SYSTEM_PROMPT = """You are Sarah, an experienced technical interviewer at a top tech company. 
You're conducting a live coding interview for a software engineering position.

Your personality:
- Warm and encouraging, but professional
- Patient with candidates who are struggling
- Give hints that guide without giving away solutions
- Celebrate good approaches and clever solutions

Your responsibilities:
1. Present problems clearly and answer clarification questions
2. Monitor the candidate's code in real-time
3. Detect logical errors early and provide helpful hints
4. Encourage good approaches to boost confidence
5. If they're stuck (no progress for 2+ minutes), offer a gentle nudge
6. Score their final solution fairly

Current problem: {problem_title}
Difficulty: {difficulty}
Optimal approach: {optimal_approach}

Remember: You're NOT a linter. Ignore syntax typos - let them fix those. 
Focus on algorithmic and logical issues."""


ANALYSIS_PROMPT = """Analyze this code change and decide your next action.

Problem: {problem_title}
Expected approach: {optimal_approach}

Previous code:
```python
{previous_code}
```

Current code:
```python
{current_code}
```

Time since last change: {time_since_change} seconds
Hints already given: {hints_given}

Analyze the code and respond with ONE of these actions:
1. IGNORE - Minor change, typo fix, or candidate is making good progress. Say nothing.
2. HINT - Logical error detected that will lead to wrong answer. Provide a subtle hint.
3. ENCOURAGE - Good approach detected! Give brief encouragement.
4. PROMPT - Candidate seems stuck (2+ min no meaningful progress). Offer help.

Respond in this exact format:
ACTION: [IGNORE|HINT|ENCOURAGE|PROMPT]
REASONING: [Your internal reasoning - not shown to candidate]
MESSAGE: [What you'll say to candidate, or empty if IGNORE]"""


SCORING_PROMPT = """Score this interview based on the candidate's final code and conversation.

Problem: {problem_title} ({difficulty})
Optimal approach: {optimal_approach}

Final submitted code:
```python
{final_code}
```

Test results: {test_results}

Conversation transcript:
{transcript}

Number of hints given: {hints_given}
Interview duration: {duration_minutes} minutes

Score each dimension from 0-10:

1. CORRECTNESS (0-10): Does the solution work? Pass all test cases?
2. OPTIMIZATION (0-10): Time/space complexity. Did they achieve optimal solution?
3. COMMUNICATION (0-10): Did they explain their approach? Think aloud?
4. PROBLEM_SOLVING (0-10): How was their problem-solving process? Did they need many hints?

Respond in this exact format:
CORRECTNESS: [0-10]
OPTIMIZATION: [0-10]
COMMUNICATION: [0-10]
PROBLEM_SOLVING: [0-10]
NOTES: [Brief interviewer notes about the candidate's performance]"""


class InterviewerAgent:
    """
    Agent 1: Technical Interviewer
    
    Conducts real-time technical interviews with code analysis,
    hint generation, and solution scoring.
    """
    
    def __init__(self):
        settings = get_settings()
        self.llm = ChatOpenAI(
            model=settings.interviewer_model,
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            temperature=0.7,  # Some personality variation
            max_tokens=1024,
        )
        self.settings = settings
    
    def present_problem(self, state: InterviewState) -> str:
        """Generate initial problem presentation speech."""
        problem = state["problem"]
        
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=INTERVIEWER_SYSTEM_PROMPT.format(
                problem_title=problem["title"],
                difficulty=problem["difficulty"],
                optimal_approach=problem["optimal_approach"],
            )),
            HumanMessage(content=f"""Present this problem to the candidate in a friendly, conversational way.
            
Problem: {problem['title']}
Prompt: {problem['prompt']}
Constraints: {', '.join(problem['constraints'])}

Keep it under 3 sentences. Don't reveal the optimal solution approach.""")
        ])
        
        response = self.llm.invoke(prompt.format_messages())
        message = response.content
        
        # Log event
        log_event(
            "AGENT_RESPONSE",
            state["session_id"],
            {"message": message, "action": "present_problem"}
        )
        
        return message
    
    def analyze_code(
        self, 
        state: InterviewState,
        new_code: str,
    ) -> tuple[AnalysisAction, str | None]:
        """
        Analyze code change and determine response action.
        
        Returns:
            Tuple of (action, message or None)
        """
        problem = state["problem"]
        previous_code = state["code_snapshot"]
        
        # Calculate time since last change
        if state.get("last_code_change_at"):
            last_change = datetime.fromisoformat(state["last_code_change_at"])
            time_delta = (datetime.now() - last_change).total_seconds()
        else:
            time_delta = 0
        
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=INTERVIEWER_SYSTEM_PROMPT.format(
                problem_title=problem["title"],
                difficulty=problem["difficulty"],
                optimal_approach=problem["optimal_approach"],
            )),
            HumanMessage(content=ANALYSIS_PROMPT.format(
                problem_title=problem["title"],
                optimal_approach=problem["optimal_approach"],
                previous_code=previous_code,
                current_code=new_code,
                time_since_change=int(time_delta),
                hints_given=state.get("hints_given", 0),
            ))
        ])
        
        response = self.llm.invoke(prompt.format_messages())
        content = response.content
        
        # Parse response
        action = self._parse_action(content)
        message = self._parse_message(content) if action != "IGNORE" else None
        
        # Log appropriate event
        if action == "HINT":
            log_event(
                "HINT_GIVEN",
                state["session_id"],
                {"message": message, "code_context": new_code[:200]}
            )
        elif action == "ENCOURAGE":
            log_event(
                "ENCOURAGE",
                state["session_id"],
                {"message": message}
            )
        elif action == "PROMPT":
            log_event(
                "INTERRUPT",
                state["session_id"],
                {"message": message, "reason": "stuck"}
            )
        
        return action, message
    
    def score_solution(
        self,
        state: InterviewState,
        test_results: dict,
    ) -> tuple[InterviewScores, str]:
        """
        Score the final solution.
        
        Returns:
            Tuple of (scores dict, interviewer notes)
        """
        problem = state["problem"]
        
        # Build transcript
        transcript = "\n".join([
            f"{msg['role'].upper()}: {msg['content']}"
            for msg in state.get("conversation_history", [])
        ])
        
        # Calculate duration
        started = datetime.fromisoformat(state["started_at"])
        duration = (datetime.now() - started).total_seconds() / 60
        
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="You are a fair and thorough technical interviewer scoring a candidate."),
            HumanMessage(content=SCORING_PROMPT.format(
                problem_title=problem["title"],
                difficulty=problem["difficulty"],
                optimal_approach=problem["optimal_approach"],
                final_code=state["code_snapshot"],
                test_results=str(test_results),
                transcript=transcript or "(No conversation recorded)",
                hints_given=state.get("hints_given", 0),
                duration_minutes=int(duration),
            ))
        ])
        
        response = self.llm.invoke(prompt.format_messages())
        content = response.content
        
        # Parse scores
        scores = self._parse_scores(content)
        notes = self._parse_notes(content)
        
        # Log final verdict
        log_event(
            "FINAL_VERDICT",
            state["session_id"],
            {
                "scores": scores,
                "notes": notes,
                "duration_minutes": int(duration),
            }
        )
        
        return InterviewScores(**scores), notes
    
    def _parse_action(self, content: str) -> AnalysisAction:
        """Extract action from LLM response."""
        for line in content.split("\n"):
            if line.startswith("ACTION:"):
                action = line.replace("ACTION:", "").strip()
                if action in ("IGNORE", "HINT", "ENCOURAGE", "PROMPT"):
                    return action
        return "IGNORE"  # Default to ignore if parsing fails
    
    def _parse_message(self, content: str) -> str:
        """Extract message from LLM response."""
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.startswith("MESSAGE:"):
                # Get everything after MESSAGE: on this and following lines
                message = line.replace("MESSAGE:", "").strip()
                # Include continuation lines
                for j in range(i + 1, len(lines)):
                    if not any(lines[j].startswith(k) for k in ["ACTION:", "REASONING:"]):
                        message += " " + lines[j].strip()
                    else:
                        break
                return message.strip()
        return ""
    
    def _parse_scores(self, content: str) -> dict[str, int]:
        """Extract scores from LLM response."""
        scores = {
            "correctness": 5,
            "optimization": 5,
            "communication": 5,
            "problem_solving": 5,
        }
        
        for line in content.split("\n"):
            line = line.strip()
            for key in scores:
                if line.upper().startswith(key.upper() + ":"):
                    try:
                        value = int(line.split(":")[1].strip().split()[0])
                        scores[key] = max(0, min(10, value))
                    except (ValueError, IndexError):
                        pass
        
        return scores
    
    def _parse_notes(self, content: str) -> str:
        """Extract interviewer notes from LLM response."""
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.startswith("NOTES:"):
                notes = line.replace("NOTES:", "").strip()
                for j in range(i + 1, len(lines)):
                    notes += " " + lines[j].strip()
                return notes.strip()
        return "No additional notes."
