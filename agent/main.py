"""
ARETE Agent Core - Main Application

FastAPI server for the AI Technical Interview Platform.
Integrates LangGraph agents, real-time WebSocket communication,
and Arize Phoenix observability.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .api.routes import router as api_router
from .api.websocket import websocket_router


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def setup_tracing():
    """Initialize Arize Phoenix tracing if enabled."""
    settings = get_settings()
    
    if not settings.enable_tracing:
        logger.info("Tracing disabled")
        return
    
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        
        # Set up tracer
        provider = TracerProvider()
        
        # Configure OTLP exporter to Phoenix
        exporter = OTLPSpanExporter(
            endpoint=f"{settings.phoenix_collector_endpoint}/v1/traces"
        )
        
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        
        logger.info(f"Phoenix tracing enabled: {settings.phoenix_collector_endpoint}")
    except ImportError:
        logger.warning("OpenTelemetry packages not installed, tracing disabled")
    except Exception as e:
        logger.error(f"Failed to initialize tracing: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    logger.info("Starting ARETE Agent Core...")
    settings = get_settings()
    
    # Initialize tracing
    setup_tracing()
    
    # Validate required settings
    if not settings.openrouter_api_key:
        logger.warning("OPENROUTER_API_KEY not set - agent calls will fail")
    
    logger.info(f"Using interviewer model: {settings.interviewer_model}")
    logger.info(f"Using fairness model: {settings.fairness_model}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down ARETE Agent Core...")


# Create FastAPI app
app = FastAPI(
    title="ARETE Agent Core",
    description="AI Technical Interview Platform - Agent Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(api_router)
app.include_router(websocket_router)


# =============================================================================
# Root Endpoints
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "ARETE Agent Core",
        "version": "1.0.0",
        "description": "AI Technical Interview Platform",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    settings = get_settings()
    
    return {
        "status": "healthy",
        "version": "1.0.0",
        "config": {
            "openrouter_configured": bool(settings.openrouter_api_key),
            "livekit_configured": bool(settings.livekit_url and settings.livekit_api_key),
            "tracing_enabled": settings.enable_tracing,
        }
    }


@app.get("/config")
async def get_config():
    """Get public configuration (no secrets)."""
    settings = get_settings()
    
    return {
        "app_name": settings.app_name,
        "interviewer_model": settings.interviewer_model,
        "fairness_model": settings.fairness_model,
        "code_snapshot_interval": settings.code_snapshot_interval_seconds,
        "stuck_timeout": settings.stuck_timeout_seconds,
        "max_interview_duration": settings.max_interview_duration_seconds,
    }


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "agent.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
