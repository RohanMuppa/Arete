"""
ARETE Configuration Module
Centralized settings management using Pydantic Settings.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )
    
    # Application
    app_name: str = "ARETE Agent Core"
    debug: bool = False
    
    # OpenRouter API (supports Claude, GPT-4, etc.)
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    
    # Models (via OpenRouter)
    interviewer_model: str = "anthropic/claude-3.5-sonnet"
    fairness_model: str = "google/gemini-3-pro-preview"
    
    # LiveKit (Video + Voice)
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    
    # ElevenLabs (TTS)
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Default: Rachel
    
    # Deepgram (STT)
    deepgram_api_key: str = ""
    
    # D-ID (Avatar)
    did_api_key: str = ""
    
    # Arize Phoenix (Observability)
    phoenix_collector_endpoint: str = "http://localhost:6006"
    enable_tracing: bool = True
    
    # Database
    database_url: str = "postgresql://user:pass@localhost:5432/arete"
    
    # Redis (Caching)
    redis_url: str = "redis://localhost:6379"
    
    # Interview Settings
    code_snapshot_interval_seconds: float = 1.5
    stuck_timeout_seconds: float = 120.0  # 2 minutes
    max_interview_duration_seconds: float = 1800.0  # 30 minutes


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

