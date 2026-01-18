"""
ARETE LiveKit Voice Agent

Real-time voice interview agent using LiveKit's STT/TTS pipeline.
Integrates with the InterviewerAgent for interview logic.

Run with:
    python -m agent.livekit_agent dev
"""

import asyncio
import logging
from typing import Callable, Awaitable
from datetime import datetime

from dotenv import load_dotenv
import json
import livekit.rtc as rtc
from livekit.agents import cli, llm, JobContext, JobProcess, WorkerOptions
from livekit.agents.voice import Agent, AgentSession, room_io
from livekit.agents.voice.events import CloseEvent
from livekit.plugins import deepgram, openai, silero, elevenlabs

# Load environment variables
load_dotenv()

from .config import get_settings
from .graph.state import ProblemInfo, create_initial_state, ConversationMessage
from .events import log_event
from .api.routes import PROBLEM_BANK, _execute_code


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Interview system prompt for the LLM
INTERVIEWER_INSTRUCTIONS = """You are Sarah, an experienced technical interviewer at a top tech company.
You're conducting a live voice coding interview for a software engineering position.

Your personality:
- Warm and encouraging, but professional
- Patient with candidates who are struggling
- Give hints that guide without giving away solutions
- Celebrate good approaches and clever solutions

Your responsibilities:
1. Present problems clearly and answer clarification questions
2. Give hints when the candidate is stuck
3. Encourage good approaches to boost confidence
4. Score their final solution fairly

Current problem: {problem_title}
Difficulty: {difficulty}
Problem description: {problem_prompt}
Optimal approach: {optimal_approach}

Start by introducing yourself and presenting the problem. Keep responses conversational and concise (1-3 sentences).
Remember: You're having a voice conversation, so be natural and speak like a person."""


class InterviewerAgent(Agent):
    """Custom interview agent with code execution capabilities."""
    
    def __init__(self, problem: ProblemInfo, state: dict, on_disconnect: Callable[[], Awaitable[None]] = None):
        super().__init__(
            instructions=INTERVIEWER_INSTRUCTIONS.format(
                problem_title=problem["title"],
                difficulty=problem["difficulty"],
                problem_prompt=problem["prompt"],
                optimal_approach=problem["optimal_approach"],
            ) + "\n\nYou have access to the candidate's code. Use the `run_tests` tool to verify their solution when they ask or when they think they are done.\nIf the candidate says they are finished or wants to end the interview, use the `end_interview` tool."
        )
        self.problem = problem
        self.state = state
        self.on_disconnect = on_disconnect
    
    @llm.function_tool(description="End the interview session.")
    async def end_interview(self):
        """Ends the interview and disconnects the session."""
        logger.info("Agent initiating disconnect sequence...")
        # Schedule disconnect with delay to allow TTS to finish
        asyncio.create_task(self._disconnect_later())
        return "I will end the interview now. Goodbye!"

    async def _disconnect_later(self):
        """Waits for speech to finish then disconnects."""
        logger.info("Waiting for final speech...")
        await asyncio.sleep(5) # Allow 5s for TTS
        logger.info("Disconnecting...")
        if self.on_disconnect:
            await self.on_disconnect()

    @llm.function_tool(description="Run the tests on the candidate's current code solution")
    def run_tests(self):
        """Executes the candidate's code against the problem's test cases."""
        logger.info("Running tests on candidate code...")
        code = self.state.get("code_snapshot", "")
        if not code:
            return "No code found in the editor."
        try:
            results = _execute_code(code, self.problem)
            return json.dumps(results)
        except Exception as e:
            return f"Error executing code: {e}"


def prewarm(proc: JobProcess):
    """Prewarm resources for faster startup."""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the LiveKit voice agent."""
    settings = get_settings()
    
    # Get problem from room metadata or default to Two Sum
    problem_id = ctx.room.metadata or "two_sum"
    problem = PROBLEM_BANK.get(problem_id, PROBLEM_BANK["two_sum"])
    
    # Create interview state
    session_id = ctx.room.name
    state = create_initial_state(session_id, "Candidate", problem)
    
    # Log session start
    log_event(
        "SESSION_START",
        session_id,
        {
            "problem_id": problem["id"],
            "problem_title": problem["title"],
        }
    )
    
    # Connect to room
    await ctx.connect()
    
    # Config for OpenRouter (using OpenAI plugin)
    llm_plugin = openai.LLM(
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
        model=settings.interviewer_model,
    )

    # Config for STT (Deepgram)
    stt_plugin = deepgram.STT(
        api_key=settings.deepgram_api_key or None,
        model="nova-2-general",
    )

    # Config for TTS (ElevenLabs)
    tts_plugin = elevenlabs.TTS(
        api_key=settings.elevenlabs_api_key or None,
        voice_id=settings.elevenlabs_voice_id or "21m00Tcm4TlvDq8ikWAM",  # Defaults to Rachel
    )
    
    # Initialize AgentSession with Plugins
    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
    )

    # --- DATA CHANNEL & PERSISTENCE ---
    @ctx.room.on("data_received")
    def on_data(datapacket: rtc.DataPacket):
        """Receive code snapshots from frontend."""
        try:
            payload = datapacket.data.decode("utf-8")
            try:
                data = json.loads(payload)
                if data.get("type") == "code_snapshot":
                    state["code_snapshot"] = data.get("code", "")
                    logger.info(f"Updated code snapshot (len={len(state['code_snapshot'])})")
            except json.JSONDecodeError:
                pass
        except Exception as e:
            logger.warning(f"Failed to process data packet: {e}")

    # --- HACKATHON QUICK INTEGRATION ---
    from .agents.fairness import FairnessAgent
    from .graph.state import ConversationMessage
    
    # Run Fairness Analysis on close
    @session.on("close")
    def on_close(event: CloseEvent):
        logger.info("Session closing, running FAIRNESS ANALYSIS...")
        try:
            # 1. Populate state from session history
            # The session automatically maintains the chat context
            for msg in session.history.items:
                if msg.type == "message" and msg.role in ("user", "assistant"):
                    # content can be str or list of Content, we assume simple text for now
                    text_content = msg.content
                    if isinstance(text_content, list):
                        text_content = " ".join([str(c) for c in text_content])
                    
                    state["conversation_history"].append(
                        ConversationMessage(
                            role=msg.role, 
                            content=str(text_content)
                        )
                    )
            
            logger.info(f"Captured {len(state['conversation_history'])} messages for analysis.")

            # 2. Run Fairness Agent
            fairness_agent = FairnessAgent()
            state["ended_at"] = datetime.now().isoformat()
            
            result = fairness_agent.analyze_interview(state)
            
            logger.info("==========================================")
            logger.info("          FAIRNESS REPORT                 ")
            logger.info("==========================================")
            logger.info(f"Bias Detected: {result['bias_detected']}")
            logger.info(f"Fairness Score: {result['fairness_score']}/10")
            logger.info(f"Recommendation: {result['recommendation']}")
            logger.info(f"Flags: {result['flags']}")
            logger.info("==========================================")
            
            # Save report
            filename = f"session_{state['session_id']}.json"
            with open(filename, "w") as f:
                json.dump(state, f, indent=2, default=str)
            logger.info(f"Saved session report to {filename}")

        except Exception as e:
            logger.error(f"Failed to run fairness analysis: {e}", exc_info=True)

    # -----------------------------------
    
    # Start the session with our custom interviewer agent
    await session.start(
        agent=InterviewerAgent(problem, state, on_disconnect=lambda: ctx.room.disconnect()),
        room=ctx.room,
    )
    
    logger.info(f"Interview started for session {session_id}")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
