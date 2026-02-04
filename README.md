# ARETE

AI-powered technical interview platform. Conducts live coding interviews with real-time voice, code execution, and fairness monitoring.

Built at **NexHacks 2026 @ CMU**.

## what it does

1. **AI interviewer** asks LeetCode-style problems via voice
2. **Candidate codes** in a live Monaco editor
3. **Real-time hints** when the AI detects logical errors
4. **Code execution** runs submissions against test cases
5. **Fairness agent** monitors for bias and normalizes scores
6. **Recruiter dashboard** shows scores, transcript, and bias report

## architecture

```
candidate                    backend                         services
    │                           │                                │
    │   voice/video (WebRTC)    │                                │
    ├──────────────────────────►│ LiveKit                        │
    │                           │                                │
    │   code snapshots          │                                │
    ├──────────────────────────►│ LangGraph                      │
    │                           │    ├── interviewer agent       │──► Claude API
    │                           │    └── fairness agent          │──► Arize Phoenix
    │                           │                                │
    │   run/submit              │                                │
    ├──────────────────────────►│ code execution (sandboxed)     │
    │                           │                                │
    │◄──────────────────────────┤ voice response                 │──► ElevenLabs TTS
    │                           │                                │──► Deepgram STT
```

## stack

**backend**: Python, FastAPI, LangGraph, LiveKit Agents  
**frontend**: Next.js, React, Monaco Editor, Tailwind  
**AI**: Claude 3.5 Sonnet (interviewer), Claude Haiku (fairness)  
**voice**: LiveKit WebRTC, Deepgram STT, ElevenLabs TTS  
**observability**: Arize Phoenix tracing  

## setup

```bash
# backend
cd agent
pip install -r requirements.txt
cp .env.example .env  # add API keys
python main.py

# frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## env vars

```
ANTHROPIC_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
ELEVENLABS_API_KEY=
DEEPGRAM_API_KEY=
PHOENIX_API_KEY=
```

## agents

**interviewer** (`agent/agents/interviewer.py`)
- asks problems from curated set
- watches code in real-time
- gives hints on logical errors
- scores correctness, optimization, communication

**fairness** (`agent/agents/fairness.py`)
- analyzes transcript for bias
- flags unfair questions
- normalizes scores across demographics
- generates bias report

## features

- sub-2s voice latency (LiveKit + Groq)
- 10+ LeetCode problems with test cases
- sandboxed Python execution (5s timeout)
- full interview tracing with Arize Phoenix
- recruiter dashboard with scores and artifacts
