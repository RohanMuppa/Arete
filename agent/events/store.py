"""
ARETE Event Store
In-memory event logging with upgrade path to Redis/PostgreSQL.
"""

from datetime import datetime
from typing import Any
from collections import defaultdict
import threading

from .types import EventType, InterviewEvent, EventPriority


# Thread-safe in-memory store
_lock = threading.Lock()
_event_log: list[InterviewEvent] = []
_session_index: dict[str, list[int]] = defaultdict(list)  # session_id -> event indices


def log_event(
    event_type: EventType,
    session_id: str,
    payload: dict[str, Any],
    priority: EventPriority = EventPriority.MEDIUM,
) -> InterviewEvent:
    """
    Log an interview event.
    
    Args:
        event_type: Type of event (CODE_SNAPSHOT, HINT_GIVEN, etc.)
        session_id: Interview session identifier
        payload: Event-specific data
        priority: Event priority level
        
    Returns:
        The created InterviewEvent
    """
    event = InterviewEvent(
        type=event_type,
        session_id=session_id,
        payload=payload,
        timestamp=datetime.now(),
        priority=priority,
    )
    
    with _lock:
        idx = len(_event_log)
        _event_log.append(event)
        _session_index[session_id].append(idx)
    
    return event


def get_events(
    event_type: EventType | None = None,
    session_id: str | None = None,
    limit: int | None = None,
    since: datetime | None = None,
) -> list[InterviewEvent]:
    """
    Query events with optional filters.
    
    Args:
        event_type: Filter by event type
        session_id: Filter by session ID
        limit: Maximum number of events to return
        since: Only return events after this timestamp
        
    Returns:
        List of matching events
    """
    with _lock:
        if session_id:
            indices = _session_index.get(session_id, [])
            events = [_event_log[i] for i in indices]
        else:
            events = list(_event_log)
    
    # Apply filters
    if event_type:
        events = [e for e in events if e.type == event_type]
    
    if since:
        events = [e for e in events if e.timestamp > since]
    
    # Sort by timestamp descending
    events.sort(key=lambda e: e.timestamp, reverse=True)
    
    if limit:
        events = events[:limit]
    
    return events


def get_session_events(session_id: str) -> list[InterviewEvent]:
    """Get all events for a specific session, chronologically ordered."""
    with _lock:
        indices = _session_index.get(session_id, [])
        events = [_event_log[i] for i in indices]
    
    events.sort(key=lambda e: e.timestamp)
    return events


def clear_session(session_id: str) -> int:
    """
    Clear all events for a session.
    
    Returns:
        Number of events removed
    """
    with _lock:
        indices = _session_index.get(session_id, [])
        count = len(indices)
        
        # Mark events as None (can't remove due to index references)
        # In production, would use soft delete or Redis expiry
        for idx in indices:
            _event_log[idx] = None  # type: ignore
        
        del _session_index[session_id]
        
    return count


def get_event_count(session_id: str | None = None) -> int:
    """Get total event count, optionally filtered by session."""
    with _lock:
        if session_id:
            return len(_session_index.get(session_id, []))
        return sum(1 for e in _event_log if e is not None)


def get_session_transcript(session_id: str) -> list[dict[str, Any]]:
    """
    Get interview transcript (conversation events only).
    
    Returns list of messages suitable for display.
    """
    events = get_session_events(session_id)
    transcript = []
    
    for event in events:
        if event.type in ("CANDIDATE_MESSAGE", "AGENT_RESPONSE", "HINT_GIVEN"):
            transcript.append({
                "role": "candidate" if event.type == "CANDIDATE_MESSAGE" else "interviewer",
                "content": event.payload.get("message", ""),
                "timestamp": event.timestamp.isoformat(),
                "type": event.type,
            })
    
    return transcript
