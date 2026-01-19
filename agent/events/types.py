"""
ARETE Event Types
Defines the event schema for interview tracking and observability.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Any
from enum import Enum


# Event type literals as defined in PRD
EventType = Literal[
    "CODE_SNAPSHOT",     # Candidate code update
    "INTERRUPT",         # Agent interrupts with feedback
    "ENCOURAGE",         # Agent encourages good approach
    "RUN_RESULT",        # Code execution result
    "HINT_GIVEN",        # Agent provides hint
    "FINAL_VERDICT",     # Final score and recommendation
    "CANDIDATE_MESSAGE", # Candidate speaks/types message
    "AGENT_RESPONSE",    # Agent verbal response
    "SESSION_START",     # Interview session started
    "SESSION_END",       # Interview session ended
]


class EventPriority(str, Enum):
    """Priority levels for event handling."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class InterviewEvent:
    """
    Unified event schema for interview tracking.
    Drives dashboard, reports, and Phoenix traces.
    """
    type: EventType
    session_id: str
    payload: dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.now)
    priority: EventPriority = EventPriority.MEDIUM
    
    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "session_id": self.session_id,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "priority": self.priority.value,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "InterviewEvent":
        """Create event from dictionary."""
        return cls(
            type=data["type"],
            session_id=data["session_id"],
            payload=data["payload"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            priority=EventPriority(data.get("priority", "medium")),
        )


@dataclass
class CodeSnapshot:
    """Structured code snapshot payload."""
    code: str
    language: str
    cursor_position: int | None = None
    changed_lines: list[int] | None = None


@dataclass
class RunResult:
    """Structured code execution result payload."""
    passed: int
    failed: int
    total: int
    details: list[dict[str, Any]]
    stderr: str | None = None
    execution_time_ms: float | None = None


@dataclass
class InterviewScore:
    """Interview scoring structure."""
    correctness: int  # 0-10
    optimization: int  # 0-10
    communication: int  # 0-10
    problem_solving: int  # 0-10
    
    @property
    def overall(self) -> float:
        """Calculate overall score."""
        return (self.correctness + self.optimization + 
                self.communication + self.problem_solving) / 4
    
    @property
    def recommendation(self) -> str:
        """Get hiring recommendation based on score."""
        score = self.overall
        if score >= 8.5:
            return "STRONG HIRE"
        elif score >= 7.0:
            return "HIRE"
        elif score >= 5.0:
            return "LEAN NO HIRE"
        else:
            return "NO HIRE"
