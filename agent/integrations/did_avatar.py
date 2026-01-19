"""
D-ID Avatar Integration for ARETE

Creates a realistic lip-synced video avatar from TTS audio.
Uses D-ID's Streaming API for real-time video generation.

Cost: ~$0.10/min
"""

import asyncio
import aiohttp
import logging
from typing import Optional, AsyncGenerator
import json

logger = logging.getLogger(__name__)

DID_API_BASE = "https://api.d-id.com"


class DIDAvatar:
    """D-ID streaming avatar for real-time lip-sync video."""

    def __init__(self, api_key: str, source_image_url: str):
        """
        Initialize D-ID avatar.

        Args:
            api_key: D-ID API key
            source_image_url: URL to the avatar's face image (static photo)
        """
        self.api_key = api_key
        self.source_image_url = source_image_url
        self.stream_id: Optional[str] = None
        self.session_id: Optional[str] = None
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Basic {self.api_key}",
                    "Content-Type": "application/json",
                }
            )
        return self._session

    async def create_stream(self) -> dict:
        """
        Create a new streaming session with D-ID.
        Returns WebRTC connection details.
        """
        session = await self._get_session()

        payload = {
            "source_url": self.source_image_url,
            "driver_url": "bank://lively",  # Use D-ID's idle animation
            "config": {
                "stitch": True,  # Better quality stitching
                "result_format": "mp4",
            },
            "stream": True,
        }

        async with session.post(
            f"{DID_API_BASE}/talks/streams",
            json=payload,
        ) as resp:
            if resp.status != 201:
                error = await resp.text()
                raise Exception(f"D-ID stream creation failed: {error}")

            data = await resp.json()
            self.stream_id = data["id"]
            self.session_id = data["session_id"]

            logger.info(f"D-ID stream created: {self.stream_id}")

            return {
                "stream_id": self.stream_id,
                "session_id": self.session_id,
                "offer": data.get("offer"),  # WebRTC SDP offer
                "ice_servers": data.get("ice_servers", []),
            }

    async def send_audio(self, audio_url: str) -> dict:
        """
        Send audio to the stream for lip-sync.
        The avatar will speak with the provided audio.

        Args:
            audio_url: URL to the audio file (from ElevenLabs)
        """
        if not self.stream_id:
            raise Exception("Stream not created. Call create_stream() first.")

        session = await self._get_session()

        payload = {
            "script": {
                "type": "audio",
                "audio_url": audio_url,
            },
            "config": {
                "stitch": True,
            },
            "session_id": self.session_id,
        }

        async with session.post(
            f"{DID_API_BASE}/talks/streams/{self.stream_id}",
            json=payload,
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                raise Exception(f"D-ID audio send failed: {error}")

            data = await resp.json()
            logger.info(f"D-ID audio sent, duration: {data.get('duration', 'unknown')}s")
            return data

    async def send_text(self, text: str, voice_id: str = "en-US-JennyNeural") -> dict:
        """
        Send text to the stream (D-ID will use its own TTS).
        Alternative to send_audio() if you don't have pre-generated audio.

        Args:
            text: Text for the avatar to speak
            voice_id: Microsoft Azure voice ID
        """
        if not self.stream_id:
            raise Exception("Stream not created. Call create_stream() first.")

        session = await self._get_session()

        payload = {
            "script": {
                "type": "text",
                "input": text,
                "provider": {
                    "type": "microsoft",
                    "voice_id": voice_id,
                },
            },
            "config": {
                "stitch": True,
            },
            "session_id": self.session_id,
        }

        async with session.post(
            f"{DID_API_BASE}/talks/streams/{self.stream_id}",
            json=payload,
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                raise Exception(f"D-ID text send failed: {error}")

            data = await resp.json()
            return data

    async def set_answer(self, sdp_answer: str) -> None:
        """
        Complete WebRTC handshake by sending SDP answer.
        Call this after receiving the offer and creating your answer.
        """
        if not self.stream_id:
            raise Exception("Stream not created.")

        session = await self._get_session()

        payload = {
            "answer": sdp_answer,
            "session_id": self.session_id,
        }

        async with session.post(
            f"{DID_API_BASE}/talks/streams/{self.stream_id}/sdp",
            json=payload,
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                raise Exception(f"D-ID SDP answer failed: {error}")

    async def add_ice_candidate(self, candidate: dict) -> None:
        """Add ICE candidate for WebRTC connection."""
        if not self.stream_id:
            raise Exception("Stream not created.")

        session = await self._get_session()

        payload = {
            "candidate": candidate,
            "session_id": self.session_id,
        }

        async with session.post(
            f"{DID_API_BASE}/talks/streams/{self.stream_id}/ice",
            json=payload,
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                logger.warning(f"D-ID ICE candidate failed: {error}")

    async def close(self) -> None:
        """Close the streaming session."""
        if self.stream_id:
            session = await self._get_session()
            try:
                async with session.delete(
                    f"{DID_API_BASE}/talks/streams/{self.stream_id}",
                    params={"session_id": self.session_id},
                ) as resp:
                    logger.info(f"D-ID stream closed: {resp.status}")
            except Exception as e:
                logger.warning(f"Failed to close D-ID stream: {e}")

        if self._session:
            await self._session.close()
            self._session = None


# Alternative: Simli for lower latency
class SimliAvatar:
    """
    Simli real-time avatar (alternative to D-ID).
    Better latency, purpose-built for conversations.
    """

    SIMLI_API_BASE = "https://api.simli.ai"

    def __init__(self, api_key: str, face_id: str):
        self.api_key = api_key
        self.face_id = face_id
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
            )
        return self._session

    async def start_session(self) -> dict:
        """Start a Simli streaming session."""
        session = await self._get_session()

        payload = {
            "faceId": self.face_id,
            "isJPG": False,  # Use WebRTC video
        }

        async with session.post(
            f"{self.SIMLI_API_BASE}/startAudioToVideoSession",
            json=payload,
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                raise Exception(f"Simli session start failed: {error}")

            data = await resp.json()
            return data

    async def send_audio_chunk(self, audio_data: bytes) -> None:
        """Send audio chunk for real-time lip-sync."""
        # Simli uses WebSocket for real-time audio streaming
        pass

    async def close(self) -> None:
        if self._session:
            await self._session.close()


# Simple helper to upload audio to a temporary URL
async def upload_audio_temp(audio_bytes: bytes, content_type: str = "audio/mpeg") -> str:
    """
    Upload audio bytes to a temporary hosting service.
    Returns a public URL that D-ID can access.

    For production, use S3, GCS, or similar.
    For hackathon, you can use transfer.sh or similar.
    """
    async with aiohttp.ClientSession() as session:
        # Using transfer.sh as a quick solution
        async with session.put(
            "https://transfer.sh/audio.mp3",
            data=audio_bytes,
            headers={"Content-Type": content_type},
        ) as resp:
            if resp.status == 200:
                url = await resp.text()
                return url.strip()
            else:
                raise Exception(f"Audio upload failed: {resp.status}")
