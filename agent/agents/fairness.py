"""
ARETE Fairness Monitor Agent

Agent 2: Analyzes interview transcript for bias, normalizes scores,
and generates fairness reports.

Uses Claude 3 Haiku via OpenRouter for cost-effective analysis.
"""

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate

from ..config import get_settings
from ..graph.state import InterviewState, FairnessResult, InterviewScores
from ..events import log_event


FAIRNESS_SYSTEM_PROMPT = """You are an AI fairness auditor reviewing technical interviews for bias.

Your role is to:
1. Analyze interview transcripts for problematic patterns
2. Detect microaggressions, unfair questioning, or biased language
3. Verify scoring consistency with the actual performance
4. Normalize scores based on hint frequency and interview conditions
5. Flag any issues that could indicate discrimination

You are objective, thorough, and focused on ensuring fair treatment of all candidates."""


BIAS_ANALYSIS_PROMPT = """Analyze this interview for potential bias and fairness issues.

Candidate: {candidate_name}
Problem: {problem_title} ({difficulty})

Interview Transcript:
{transcript}

Interviewer's Raw Scores:
- Correctness: {correctness}/10
- Optimization: {optimization}/10  
- Communication: {communication}/10
- Problem Solving: {problem_solving}/10

Additional Context:
- Hints given: {hints_given}
- Interview duration: {duration_minutes} minutes
- Test results: {test_results}

Analyze for:
1. INAPPROPRIATE QUESTIONS: Were any personal, discriminatory, or off-topic questions asked?
2. HINT DISTRIBUTION: Were hints given fairly, or withheld/overdone?
3. TONE CONSISTENCY: Was the interviewer's tone professional throughout?
4. SCORING FAIRNESS: Do the scores match the actual performance evidence?
5. MICROAGGRESSIONS: Any subtle biased language or assumptions?

RECOMMENDATION CRITERIA (VERY HIGH BAR):
- PASS: Candidate MUST have correctly solved the problem with working code AND clearly explained their approach. Partial success is NOT enough.
- FAIL: Anything mediocre, confused, incomplete, or requiring hand-holding. When in doubt, FAIL.

Respond in this exact format:
BIAS_DETECTED: [true|false]
FAIRNESS_SCORE: [0.0-10.0]
FLAGS: [comma-separated list of issues, or "none"]
SCORE_ADJUSTMENT: [If scores need adjustment, explain. Otherwise "none needed"]
RECOMMENDATION: [PASS|FAIL]
CONFIDENCE: [0.0-1.0]
REASONING: [Explain WHY you chose PASS or FAIL. Cite specific evidence from the transcript.]"""


NORMALIZE_HINT_PENALTY = {
    0: 0,      # No hints = no penalty
    1: -0.2,   # 1 hint = small penalty
    2: -0.4,   # 2 hints = moderate penalty
    3: -0.6,   # 3 hints = larger penalty
}


class FairnessAgent:
    """
    Agent 2: Fairness Monitor
    
    Analyzes completed interviews for bias, normalizes scores,
    and generates fairness reports.
    """
    
    def __init__(self):
        settings = get_settings()
        self.llm = ChatOpenAI(
            model=settings.fairness_model,
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            temperature=0.3,  # More deterministic for analysis
            max_tokens=1024,
        )
        self.settings = settings
    
    def analyze_interview(self, state: InterviewState) -> FairnessResult:
        """
        Perform complete fairness analysis on a finished interview.
        
        Returns:
            FairnessResult with bias detection, normalized scores, and recommendation
        """
        # Build transcript
        transcript = self._build_transcript(state)
        
        # Check for sufficient data
        messages = state.get("conversation_history", [])
        if len(messages) < 3:
            return FairnessResult(
                bias_detected=False,
                fairness_score=0.0,
                flags=["insufficient_data"],
                normalized_scores=InterviewScores(
                    correctness=0, optimization=0, communication=0, problem_solving=0
                ),
                recommendation="NO DECISION",
                confidence=1.0
            )
        
        # Get raw scores
        raw_scores = state.get("raw_scores") or {
            "correctness": 5,
            "optimization": 5,
            "communication": 5,
            "problem_solving": 5,
        }
        
        # Calculate duration
        from datetime import datetime
        started = datetime.fromisoformat(state["started_at"])
        ended = datetime.fromisoformat(state.get("ended_at") or datetime.now().isoformat())
        duration = (ended - started).total_seconds() / 60
        
        # Get test results summary
        submissions = state.get("code_submissions", [])
        if submissions:
            last_result = submissions[-1].get("test_results", {})
            test_summary = f"Passed {last_result.get('passed', 0)}/{last_result.get('total', 0)} tests"
        else:
            test_summary = "No code submitted"
        
        # Run bias analysis
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=FAIRNESS_SYSTEM_PROMPT),
            HumanMessage(content=BIAS_ANALYSIS_PROMPT.format(
                candidate_name=state.get("candidate_name", "Unknown"),
                problem_title=state["problem"]["title"],
                difficulty=state["problem"]["difficulty"],
                transcript=transcript,
                correctness=raw_scores.get("correctness", 5),
                optimization=raw_scores.get("optimization", 5),
                communication=raw_scores.get("communication", 5),
                problem_solving=raw_scores.get("problem_solving", 5),
                hints_given=state.get("hints_given", 0),
                duration_minutes=int(duration),
                test_results=test_summary,
            ))
        ])
        
        response = self.llm.invoke(prompt.format_messages())
        content = response.content
        
        # Parse response
        bias_detected = self._parse_bool(content, "BIAS_DETECTED")
        fairness_score = self._parse_float(content, "FAIRNESS_SCORE", 8.0)
        flags = self._parse_list(content, "FLAGS")
        recommendation = self._parse_string(content, "RECOMMENDATION", "LEAN NO HIRE")
        confidence = self._parse_float(content, "CONFIDENCE", 0.7)
        reasoning = self._parse_string(content, "REASONING", "No reasoning provided")
        
        # Normalize scores based on hints
        normalized_scores = self._normalize_scores(
            raw_scores, 
            state.get("hints_given", 0)
        )
        
        result = FairnessResult(
            bias_detected=bias_detected,
            fairness_score=fairness_score,
            flags=flags,
            normalized_scores=normalized_scores,
            recommendation=recommendation,
            confidence=confidence,
            reasoning=reasoning,
        )
        
        # Log the analysis
        log_event(
            "AGENT_RESPONSE",
            state["session_id"],
            {
                "agent": "fairness",
                "result": {
                    "bias_detected": bias_detected,
                    "fairness_score": fairness_score,
                    "flags": flags,
                    "recommendation": recommendation,
                    "reasoning": reasoning,
                }
            }
        )
        
        return result
    
    def _build_transcript(self, state: InterviewState) -> str:
        """Build readable transcript from conversation history."""
        messages = state.get("conversation_history", [])
        if not messages:
            return "(No conversation recorded)"
        
        lines = []
        for msg in messages:
            role = msg["role"].upper()
            content = msg["content"]
            lines.append(f"{role}: {content}")
        
        return "\n".join(lines)
    
    def _normalize_scores(
        self, 
        raw_scores: dict, 
        hints_given: int
    ) -> InterviewScores:
        """
        Normalize scores based on hint frequency.
        
        More hints = slight reduction in problem_solving score.
        """
        normalized = dict(raw_scores)
        
        # Apply hint penalty to problem_solving
        penalty = NORMALIZE_HINT_PENALTY.get(hints_given, -1.0)
        if hints_given > 3:
            penalty = -1.0  # Max penalty for 4+ hints
        
        ps_score = normalized.get("problem_solving", 5)
        normalized["problem_solving"] = max(0, min(10, int(ps_score + penalty * 10)))
        
        return InterviewScores(**normalized)
    
    def _parse_bool(self, content: str, key: str) -> bool:
        """Parse boolean value from response."""
        for line in content.split("\n"):
            if line.strip().upper().startswith(key.upper() + ":"):
                value = line.split(":", 1)[1].strip().lower()
                return value == "true"
        return False
    
    def _parse_float(self, content: str, key: str, default: float) -> float:
        """Parse float value from response."""
        for line in content.split("\n"):
            if line.strip().upper().startswith(key.upper() + ":"):
                try:
                    value = line.split(":", 1)[1].strip()
                    return float(value.split()[0])
                except (ValueError, IndexError):
                    pass
        return default
    
    def _parse_string(self, content: str, key: str, default: str) -> str:
        """Parse string value from response. For REASONING, captures all remaining content."""
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.strip().upper().startswith(key.upper() + ":"):
                # Get value on same line
                value = line.split(":", 1)[1].strip()
                # If key is REASONING, also capture subsequent lines until end
                if key.upper() == "REASONING":
                    remaining = lines[i+1:]
                    value = value + " " + " ".join(l.strip() for l in remaining if l.strip())
                return value
        return default
    
    def _parse_list(self, content: str, key: str) -> list[str]:
        """Parse comma-separated list from response."""
        for line in content.split("\n"):
            if line.strip().upper().startswith(key.upper() + ":"):
                value = line.split(":", 1)[1].strip()
                if value.lower() == "none":
                    return []
                return [item.strip() for item in value.split(",") if item.strip()]
        return []
