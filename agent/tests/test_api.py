"""
ARETE Agent Backend - Test Suite

Pytest tests for the FastAPI endpoints and core functionality.
Run with: pytest agent/tests/ -v
"""

import pytest
from fastapi.testclient import TestClient

from agent.main import app


# =============================================================================
# Test Client Fixture
# =============================================================================

@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


# =============================================================================
# Health & Info Endpoints
# =============================================================================

class TestHealthEndpoints:
    """Tests for health and info endpoints."""
    
    def test_root_endpoint(self, client):
        """Test root endpoint returns API info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "ARETE Agent Core"
        assert data["version"] == "1.0.0"
        assert "docs" in data
    
    def test_health_endpoint(self, client):
        """Test health endpoint returns healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "config" in data
    
    def test_config_endpoint(self, client):
        """Test config endpoint returns public config."""
        response = client.get("/config")
        assert response.status_code == 200
        data = response.json()
        assert "app_name" in data
        assert "interviewer_model" in data
        assert "code_snapshot_interval" in data


# =============================================================================
# Problems Endpoint
# =============================================================================

class TestProblemsEndpoint:
    """Tests for the problems listing endpoint."""
    
    def test_list_problems(self, client):
        """Test listing available problems."""
        response = client.get("/api/v1/problems")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # At least our 3 demo problems
        
        # Check structure
        problem = data[0]
        assert "id" in problem
        assert "title" in problem
        assert "difficulty" in problem
    
    def test_problems_include_two_sum(self, client):
        """Test that Two Sum problem is available."""
        response = client.get("/api/v1/problems")
        data = response.json()
        ids = [p["id"] for p in data]
        assert "two_sum" in ids


# =============================================================================
# Interview Session Endpoints
# =============================================================================

class TestInterviewEndpoints:
    """Tests for interview session management."""
    
    @pytest.mark.skipif(
        not __import__('os').environ.get('OPENROUTER_API_KEY'),
        reason="Requires OPENROUTER_API_KEY to be set"
    )
    def test_start_interview_success(self, client):
        """Test starting a new interview session (requires API key)."""
        response = client.post(
            "/api/v1/interviews",
            json={"candidate_name": "Test User", "problem_id": "two_sum"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["candidate_name"] == "Test User"
        assert data["problem_title"] == "Two Sum"
    
    def test_start_interview_invalid_problem(self, client):
        """Test starting interview with invalid problem ID."""
        response = client.post(
            "/api/v1/interviews",
            json={"candidate_name": "Test User", "problem_id": "nonexistent"}
        )
        assert response.status_code == 404
    
    def test_start_interview_missing_fields(self, client):
        """Test starting interview with missing required fields."""
        response = client.post(
            "/api/v1/interviews",
            json={"candidate_name": "Test User"}  # Missing problem_id
        )
        assert response.status_code == 422  # Validation error
    
    def test_get_nonexistent_session(self, client):
        """Test getting a session that doesn't exist."""
        response = client.get("/api/v1/interviews/nonexistent-session-id")
        assert response.status_code == 404


# =============================================================================
# Code Execution Tests
# =============================================================================

class TestCodeExecution:
    """Tests for code execution functionality."""
    
    def test_code_execution_helper(self):
        """Test the internal code execution helper."""
        from agent.api.routes import _execute_code, PROBLEM_BANK
        
        problem = PROBLEM_BANK["two_sum"]
        
        # Test correct solution
        correct_code = """
def twoSum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
"""
        result = _execute_code(correct_code, problem)
        assert result["passed"] == 3
        assert result["failed"] == 0
        assert result["stderr"] is None
    
    def test_code_execution_wrong_answer(self):
        """Test code execution with wrong answer."""
        from agent.api.routes import _execute_code, PROBLEM_BANK
        
        problem = PROBLEM_BANK["two_sum"]
        
        wrong_code = """
def twoSum(nums, target):
    return [0, 0]  # Always wrong
"""
        result = _execute_code(wrong_code, problem)
        assert result["failed"] > 0
    
    def test_code_execution_syntax_error(self):
        """Test code execution with syntax error."""
        from agent.api.routes import _execute_code, PROBLEM_BANK
        
        problem = PROBLEM_BANK["two_sum"]
        
        bad_code = """
def twoSum(nums, target)
    return []  # Missing colon
"""
        result = _execute_code(bad_code, problem)
        assert result["stderr"] is not None


# =============================================================================
# Event System Tests
# =============================================================================

class TestEventSystem:
    """Tests for the event logging system."""
    
    def test_log_event(self):
        """Test logging an event."""
        from agent.events import log_event, get_session_events
        
        event = log_event(
            "CODE_SNAPSHOT",
            "test-session-123",
            {"code": "print('hello')"}
        )
        
        assert event.type == "CODE_SNAPSHOT"
        assert event.session_id == "test-session-123"
        assert event.payload["code"] == "print('hello')"
    
    def test_get_session_events(self):
        """Test retrieving events for a session."""
        from agent.events import log_event, get_session_events
        
        session_id = "test-session-456"
        
        # Log multiple events
        log_event("SESSION_START", session_id, {"problem": "two_sum"})
        log_event("CODE_SNAPSHOT", session_id, {"code": "def foo(): pass"})
        
        events = get_session_events(session_id)
        assert len(events) >= 2
    
    def test_get_session_transcript(self):
        """Test getting interview transcript."""
        from agent.events import log_event, get_session_transcript
        
        session_id = "test-session-789"
        
        log_event("AGENT_RESPONSE", session_id, {"message": "Hello!"})
        log_event("CANDIDATE_MESSAGE", session_id, {"message": "Hi there"})
        
        transcript = get_session_transcript(session_id)
        assert isinstance(transcript, list)


# =============================================================================
# State & Graph Tests
# =============================================================================

class TestInterviewState:
    """Tests for interview state management."""
    
    def test_create_initial_state(self):
        """Test creating initial interview state."""
        from agent.graph.state import create_initial_state, ProblemInfo
        
        problem = ProblemInfo(
            id="test",
            title="Test Problem",
            difficulty="Easy",
            prompt="Test prompt",
            starter_code="def test(): pass",
            optimal_approach="O(n)",
            test_cases=[],
            constraints=[]
        )
        
        state = create_initial_state("session-1", "John Doe", problem)
        
        assert state["session_id"] == "session-1"
        assert state["candidate_name"] == "John Doe"
        assert state["problem"]["title"] == "Test Problem"
        assert state["hints_given"] == 0
        assert state["interview_complete"] == False


# =============================================================================
# Module Import Tests
# =============================================================================

class TestModuleImports:
    """Tests to verify all modules import correctly."""
    
    def test_import_main(self):
        """Test importing main module."""
        from agent.main import app
        assert app is not None
    
    def test_import_agents(self):
        """Test importing agent classes."""
        from agent.agents import InterviewerAgent, FairnessAgent
        assert InterviewerAgent is not None
        assert FairnessAgent is not None
    
    def test_import_graph(self):
        """Test importing graph components."""
        from agent.graph import InterviewState, create_interview_graph, run_interview
        assert InterviewState is not None
        assert create_interview_graph is not None
    
    def test_import_events(self):
        """Test importing event components."""
        from agent.events import EventType, log_event, get_session_events
        assert log_event is not None
    
    def test_import_config(self):
        """Test importing configuration."""
        from agent.config import get_settings
        settings = get_settings()
        assert settings.app_name == "ARETE Agent Core"
