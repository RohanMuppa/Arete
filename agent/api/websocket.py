"""
ARETE WebSocket Handlers

Real-time communication for live interview sessions.
Handles code snapshots, agent responses, and session events.
"""

import json
from datetime import datetime
from typing import Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..events import log_event
from ..graph.orchestrator import process_code_snapshot
from .routes import _sessions, PROBLEM_BANK


websocket_router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections by session."""
    
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """Accept and register a new connection."""
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, session_id: str):
        """Remove a connection."""
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
    
    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]):
        """Send message to a specific connection."""
        await websocket.send_json(message)
    
    async def broadcast_to_session(self, session_id: str, message: dict[str, Any]):
        """Broadcast message to all connections in a session."""
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass  # Connection may be closed


manager = ConnectionManager()


# =============================================================================
# WebSocket Message Types
# =============================================================================

class WSMessage(BaseModel):
    """Base WebSocket message."""
    type: str
    data: dict[str, Any] = {}


# Incoming message types
MSG_CODE_SNAPSHOT = "code_snapshot"
MSG_CANDIDATE_MESSAGE = "candidate_message"
MSG_RUN_CODE = "run_code"
MSG_SUBMIT = "submit"
MSG_PING = "ping"

# Outgoing message types
MSG_AGENT_RESPONSE = "agent_response"
MSG_RUN_RESULT = "run_result"
MSG_INTERVIEW_COMPLETE = "interview_complete"
MSG_ERROR = "error"
MSG_PONG = "pong"


# =============================================================================
# WebSocket Endpoint
# =============================================================================

@websocket_router.websocket("/ws/{session_id}")
async def interview_websocket(websocket: WebSocket, session_id: str):
    """
    Main WebSocket endpoint for live interview sessions.
    
    Message flow:
    - Client sends code_snapshot every 1.5s
    - Server responds with agent_response if action needed
    - Client can send candidate_message for chat
    - Client sends run_code to execute tests
    - Client sends submit for final submission
    """
    # Validate session exists
    state = _sessions.get(session_id)
    if not state:
        await websocket.close(code=4004, reason="Session not found")
        return
    
    # Connect
    await manager.connect(websocket, session_id)
    
    # Send initial state
    await manager.send_personal(websocket, {
        "type": "connected",
        "data": {
            "session_id": session_id,
            "problem_title": state["problem"]["title"],
            "starter_code": state["problem"]["starter_code"],
        }
    })
    
    try:
        while True:
            # Receive message
            raw_data = await websocket.receive_text()
            
            try:
                message = json.loads(raw_data)
                msg_type = message.get("type", "")
                data = message.get("data", {})
            except json.JSONDecodeError:
                await manager.send_personal(websocket, {
                    "type": MSG_ERROR,
                    "data": {"error": "Invalid JSON"}
                })
                continue
            
            # Handle message types
            if msg_type == MSG_PING:
                await manager.send_personal(websocket, {
                    "type": MSG_PONG,
                    "data": {"timestamp": datetime.now().isoformat()}
                })
            
            elif msg_type == MSG_CODE_SNAPSHOT:
                await handle_code_snapshot(websocket, session_id, data)
            
            elif msg_type == MSG_CANDIDATE_MESSAGE:
                await handle_candidate_message(websocket, session_id, data)
            
            elif msg_type == MSG_RUN_CODE:
                await handle_run_code(websocket, session_id, data)
            
            elif msg_type == MSG_SUBMIT:
                await handle_submit(websocket, session_id, data)
            
            else:
                await manager.send_personal(websocket, {
                    "type": MSG_ERROR,
                    "data": {"error": f"Unknown message type: {msg_type}"}
                })
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)


# =============================================================================
# Message Handlers
# =============================================================================

async def handle_code_snapshot(
    websocket: WebSocket, 
    session_id: str, 
    data: dict[str, Any]
):
    """Handle code snapshot from editor."""
    state = _sessions.get(session_id)
    if not state:
        return
    
    code = data.get("code", "")
    
    # Log event
    log_event(
        "CODE_SNAPSHOT",
        session_id,
        {"code": code, "cursor": data.get("cursor_position")}
    )
    
    # Process with agent
    new_state, message = process_code_snapshot(state, code)
    _sessions[session_id] = new_state
    
    # Send response if agent has something to say
    if message:
        await manager.broadcast_to_session(session_id, {
            "type": MSG_AGENT_RESPONSE,
            "data": {
                "message": message,
                "action": "hint",
                "timestamp": datetime.now().isoformat(),
            }
        })


async def handle_candidate_message(
    websocket: WebSocket,
    session_id: str,
    data: dict[str, Any]
):
    """Handle chat message from candidate."""
    state = _sessions.get(session_id)
    if not state:
        return
    
    message = data.get("message", "")
    
    # Log event
    log_event(
        "CANDIDATE_MESSAGE",
        session_id,
        {"message": message}
    )
    
    # Add to conversation history
    if "conversation_history" not in state:
        state["conversation_history"] = []
    
    state["conversation_history"].append({
        "role": "candidate",
        "content": message,
        "timestamp": datetime.now().isoformat(),
    })
    
    _sessions[session_id] = state
    
    # TODO: Generate agent response to candidate message
    # For now, acknowledge receipt
    await manager.send_personal(websocket, {
        "type": MSG_AGENT_RESPONSE,
        "data": {
            "message": "I see. Please continue with your solution.",
            "action": "acknowledge",
            "timestamp": datetime.now().isoformat(),
        }
    })


async def handle_run_code(
    websocket: WebSocket,
    session_id: str,
    data: dict[str, Any]
):
    """Handle code execution request."""
    state = _sessions.get(session_id)
    if not state:
        return
    
    code = data.get("code", state.get("code_snapshot", ""))
    
    # Import here to avoid circular import
    from .routes import _execute_code
    
    # Execute code
    result = _execute_code(code, state["problem"])
    
    # Log event
    log_event(
        "RUN_RESULT",
        session_id,
        result
    )
    
    # Send result
    await manager.send_personal(websocket, {
        "type": MSG_RUN_RESULT,
        "data": result
    })


async def handle_submit(
    websocket: WebSocket,
    session_id: str,
    data: dict[str, Any]
):
    """Handle final solution submission."""
    from .routes import _execute_code
    from ..graph.orchestrator import finish_interview
    
    state = _sessions.get(session_id)
    if not state:
        return
    
    code = data.get("code", state.get("code_snapshot", ""))
    
    # Run final tests
    test_results = _execute_code(code, state["problem"])
    
    # Update code snapshot
    state["code_snapshot"] = code
    
    # Complete interview
    final_state = finish_interview(state, test_results)
    _sessions[session_id] = final_state
    
    # Get scores
    fairness_result = final_state.get("fairness_result", {})
    scores = fairness_result.get("normalized_scores", final_state.get("raw_scores", {}))
    overall = sum(scores.values()) / len(scores) if scores else 0
    
    # Send completion message
    await manager.broadcast_to_session(session_id, {
        "type": MSG_INTERVIEW_COMPLETE,
        "data": {
            "test_results": test_results,
            "scores": scores,
            "overall_score": round(overall, 1),
            "recommendation": final_state.get("final_recommendation", "PENDING"),
            "fairness": {
                "bias_detected": fairness_result.get("bias_detected", False),
                "fairness_score": fairness_result.get("fairness_score", 0),
            }
        }
    })
