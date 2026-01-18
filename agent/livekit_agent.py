"""
ARETE LiveKit Voice Agent

Real-time voice interview agent using LiveKit's STT/TTS pipeline.
Integrates with the InterviewerAgent for interview logic.

Run with:
    python -m agent.livekit_agent dev
"""

import asyncio
import logging
from typing import Callable, Awaitable, Annotated
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


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d - %(name)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("arete-agent")


# Interview system prompt for the LLM
INTERVIEWER_INSTRUCTIONS = """You are Sarah, an experienced technical interviewer at a top tech company.
You're conducting a live voice coding interview for a software engineering position.

Your personality:
- Professional and concise.
- Passive observer: Let the candidate drive the session.
- Do NOT interrupt with advice unless they are completely stuck or ask for help.
- Do NOT explain concepts unless asked.

Your responsibilities:
1. Present problems clearly.
3. Keep responses extremely short (1-2 sentences max).
4. ALWAYS end your turn with a DIRECT QUESTION. Never just make a statement and stop.
5. NEVER write code for the candidate or give the solution.
6. DO NOT suggest specific data structures (like "hash maps") or algorithms unless the candidate mentions them first.
7. If they are wrong, ask "Why do you think that work?" instead of correcting them. Be a tough interviewer.

Current problem: {problem_title}
Difficulty: {difficulty}
Problem description: {problem_prompt}
Optimal approach: {optimal_approach}

Start by introducing yourself and presenting the problem. Keep responses conversational and concise (1 sentence).
Remember: You're having a voice conversation, so be natural and speak like a person.

CRITICAL PRONUNCIATION GUIDE:
- Strictly use English characters only.
- DO NOT use special characters or code syntax (e.g., `[]`, `{{}}`, `=`, `()`, `->`, `_`) in your speech text.
- The TTS engine cannot pronounce code symbols correctly.
- Instead of saying "nums = [1, 2]", say "the nums list containing one and two".
- Instead of "return [i, j]", say "return a list with i and j".
- Speak completely naturally.

ALWAYS end with a clear question or affirmation to invite the candidate to speak.
"""


class InterviewerAgent(Agent):
    """Custom interview agent with code execution capabilities."""
    
    def __init__(self, problem: ProblemInfo, state: dict, on_disconnect: Callable[[], Awaitable[None]] = None):
        super().__init__(
            instructions=INTERVIEWER_INSTRUCTIONS.format(
                problem_title=problem["title"],
                difficulty=problem["difficulty"],
                problem_prompt=problem["prompt"],
                optimal_approach=problem["optimal_approach"],
            ) # + "\n\nYou have access to the candidate's code. Use the `run_tests` tool to verify their solution when they ask or when they think they are done.\nIf the candidate says they are finished or wants to end the interview, use the `end_interview` tool."
        )
        self.problem = problem
        self.state = state
        self.on_disconnect = on_disconnect
    
    @llm.function_tool(description="End the interview session.")
    async def end_interview(self, reason: Annotated[str, "The reason for ending the interview"] = "completed"):
        """Ends the interview and disconnects the session."""
        logger.info(f"Agent initiating disconnect sequence (Reason: {reason})...")
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
    async def run_tests(self, trigger: Annotated[str, "What triggered this test run"] = "manual"):
        """Executes the candidate's code against the problem's test cases."""
        logger.info(f"Running tests on candidate code (Trigger: {trigger})...")
        code = self.state.get("code_snapshot", "")
        if not code:
            return "No code found in the editor."
        try:
            # Run in executor to avoid blocking the event loop
            loop = asyncio.get_running_loop()
            results = await loop.run_in_executor(None, _execute_code, code, self.problem)
            
            # Format as natural language for the LLM to read/summarize
            passed = results["passed"]
            total = results["total"]
            if passed == total:
                return f"All {total} tests passed! Excellent work."
            
            details = []
            for d in results["details"]:
                if "error" in d:
                    details.append(f"Case {d['case']}: Error - {d['error']}")
                else:
                    details.append(f"Case {d['case']}: Expected {d['expected']}, but got {d['actual']}")
            
            failure_summary = ". ".join(details[:2]) # Limit to first 2 failures
            return f"Tests executed. {passed} passed, {results['failed']} failed out of {total}. Failures: {failure_summary}"
        except Exception as e:
            return f"Error executing code: {e}"


def prewarm(proc: JobProcess):
    """Prewarm resources for faster startup."""
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.1,  # Def: 0.05
        min_silence_duration=0.4, # Def: 0.55 (Decrease makes it snappier)
    )


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
    #llm_plugin = openai.LLM(
    #    base_url=settings.openrouter_base_url,
    #    api_key=settings.openrouter_api_key,
    #    model=settings.interviewer_model,
    #)


    llm_plugin = openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key="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",
        model="meta-llama/llama-4-maverick-17b-128e-instruct",
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
        voice_settings=elevenlabs.VoiceSettings(
            stability=0.5, # Default usually 0.5
            similarity_boost=0.75, # Default usually 0.75
            speed=0.88, # Make it slower (0.8-1.2 range)
        )
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
    async def initiate_chat():
        await asyncio.sleep(1.5) # Wait for connection stabilization
        logger.info("Triggering initial greeting...")
        try:
            # Trigger the agent to speak by simulating a system prompt
            # Explicitly forbid tool calls to prevent hallucinations like `introduce_and_present_problem`
            session.run(user_input="[System Event: User Connected] Please speak your greeting now. Introduce yourself as Sarah. Ask how the candidate is doing. (Reply with text only, NO function calls).")
        except Exception as e:
            logger.warning(f"Could not initiate chat (maybe user spoke first?): {e}")

    asyncio.create_task(initiate_chat())

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
