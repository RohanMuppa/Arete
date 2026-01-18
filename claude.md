# ARETE - AI Assistant Instructions

## Project Overview
IMPORTANT: DO NOT USE FALLBACKS ESPECIALLY THE BROWSER TTS FALLBACK

ARETE is a multi-agent AI interviewing platform built for NexHacks 2026 at CMU. This is a **24-hour hackathon project** targeting three prize tracks:

1. **LiveKit Agent Track** - Apple Watch + Internship
2. **Arize Phoenix Track** - $1,000 cash
3. **Developer Tool Track** - $500-2,000

## What is ARETE?

ARETE is a production-grade multi-agent hiring orchestration system that:
- Conducts end-to-end technical and behavioral interviews via **real-time voice** (LiveKit)
- Uses **6 specialized AI agents** that collaborate sequentially
- Scores candidates across multiple dimensions
- Detects bias in real-time using **Arize Phoenix** observability
- Produces auditable hiring recommendations

## Core Technologies

### Backend
- **FastAPI** - Python web framework
- **LangGraph** - Multi-agent orchestration framework
- **Claude API (Anthropic)** - LLM for all agents
- **PostgreSQL** - Primary database
- **Redis** - Caching and session management
- **LiveKit** - Real-time voice communication
- **Arize Phoenix** - Observability and bias detection

### Frontend
- **Next.js 14** - React framework
- **React 18** - UI library
- **TailwindCSS** - Styling
- **LiveKit React SDK** - WebRTC client

## The 6-Agent System

### Agent 2: Interview Strategy Agent
- **Purpose**: Design personalized interview plan based on resume and job requirements
- **Input**: Parsed resume + job description
- **Output**: Interview strategy (topics to cover, depth level, estimated time)
- **No voice interaction**

### Agent 3: Technical Interviewer Agent
- **Purpose**: Conduct technical interview via voice
- **Input**: Interview strategy, candidate profile
- **Output**: Technical assessment scores, conversation transcript
- **MULTI-TURN VOICE INTERACTION** (5-10 minutes, 3-5 questions)


### Agent 5: Fairness Monitor Agent
- **Purpose**: Analyze interview for bias and fairness issues
- **Input**: Complete interview transcript, scores from Agents 3 & 4
- **Output**: Fairness assessment, bias flags, recommended adjustments
- **No voice interaction**

## Key Architecture Principles

### 1. Sequential Agent Execution
Agents run in strict order:

- No parallel execution (simplifies state management for hackathon)
- Each agent reads from shared `InterviewState` object
- Each agent writes results back to state before next agent runs

### 2. Immutable State Management
```python
class InterviewState(TypedDict):
    candidate_id: str
    resume_data: dict
    interview_strategy: dict
    technical_assessment: dict
    behavioral_assessment: dict
    fairness_assessment: dict
    final_recommendation: dict
    conversation_history: list[dict]
    metadata: dict
```

### 3. Real-time Voice Integration (Agents 3 & 4 Only)
- LiveKit rooms created on-demand when voice agents start
- WebRTC connection: Candidate Browser ↔ LiveKit Cloud ↔ Backend
- Transcription: LiveKit → FastAPI webhook → Agent processing → Claude API → TTS → LiveKit → Candidate
- Turn detection: VAD (Voice Activity Detection) signals when candidate finished speaking

### 4. Full Observability with Arize Phoenix
Every agent step is traced:
```
Root Span: interview_session_<id>
├── Span: agent_1_resume_parser
├── Span: agent_2_interview_strategy
├── Span: agent_3_technical_interviewer
│   ├── Span: question_1
│   ├── Span: question_2
│   └── Span: question_3
├── Span: agent_4_behavioral_interviewer
│   ├── Span: question_1
│   └── Span: question_2
├── Span: agent_5_fairness_monitor
└── Span: agent_6_hiring_recommendation
```

## Project Structure

```
nexhacks-26/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── state.py                # InterviewState definition
│   │   ├── graph.py                # LangGraph construction
│   │   ├── models.py               # Pydantic schemas
│   │   ├── database.py             # SQLAlchemy ORM
│   │   ├── agents/
│   │   │   ├── agent_1_resume_parser.py
│   │   │   ├── agent_2_strategy.py
│   │   │   ├── agent_3_technical.py
│   │   │   ├── agent_4_behavioral.py
│   │   │   ├── agent_5_fairness.py
│   │   │   └── agent_6_recommendation.py
│   │   ├── integrations/
│   │   │   ├── livekit_client.py
│   │   │   ├── llm_client.py       # Claude API wrapper
│   │   │   └── phoenix_tracing.py  # OpenTelemetry setup
│   │   └── routers/
│   │       ├── interviews.py
│   │       └── candidates.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── upload/
│   │   │   └── page.tsx            # Resume upload
│   │   ├── interview/
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Live interview room
│   │   └── results/
│   │       └── [id]/
│   │           └── page.tsx        # Interview results
│   ├── components/
│   │   ├── LiveKitRoom.tsx
│   │   ├── InterviewProgress.tsx
│   │   └── ScoresDashboard.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
└── claude.md (this file)
```

## Development Workflow

### When making changes:
1. **Read existing code first** - Never propose changes to code you haven't read
2. **Update state definitions carefully** - InterviewState is shared by all agents
3. **Test agents in isolation** - Each agent should work independently
4. **Trace everything** - Add Phoenix spans for all LLM calls and agent transitions
5. **Handle errors gracefully** - Agents can fail; system should continue

### Time-critical decisions (24-hour hackathon):
- **Don't over-engineer** - Build exactly what's needed for demo
- **Mock when possible** - Fake data for testing > building full admin UI
- **Prioritize LiveKit + Phoenix integration** - These are prize requirements
- **Cut scope, not quality** - If running out of time, reduce number of interview questions, but keep voice + observability working

## Critical Implementation Notes

### LiveKit Integration
- Room lifecycle: Create room → Generate token → Start interview → Destroy room
- Use server-side LiveKit SDK (Python) for room management
- Use client-side LiveKit SDK (JavaScript) in React for WebRTC
- **Latency target: <200ms** end-to-end (candidate speaks → agent responds)

### LangGraph State Management
- State is passed by reference to all agents
- Use `functools.reduce`-style updates (new state = old state + agent output)
- Never mutate state in-place; always return new state object
- Snapshot state to Redis after each agent (crash recovery)

### Arize Phoenix Tracing
- Initialize Phoenix tracer on FastAPI startup
- Create root span when interview starts
- Create child span for each agent
- Log all inputs, outputs, and reasoning to spans
- Capture token usage and latency metrics
- Use Phoenix UI to show real-time agent progress to judges

### Claude API Usage
- Use `claude-3-5-sonnet-20241022` for all agents (balance of speed + quality)
- Token budgets per agent:
  - Agent 1: ~2K tokens (resume parsing)
  - Agent 2: ~3K tokens (strategy generation)
  - Agent 3: ~10K tokens (technical interview, 5 turns)
  - Agent 4: ~10K tokens (behavioral interview, 5 turns)
  - Agent 5: ~5K tokens (fairness analysis)
  - Agent 6: ~4K tokens (final recommendation)
- **Total per interview: ~34K tokens input + output**
- Use streaming for voice agents (faster perceived latency)

### Database Schema (PostgreSQL)
Key tables:
- `candidates` - Candidate profiles
- `interviews` - Interview sessions
- `agent_outputs` - Results from each agent (JSONB column)
- `conversation_turns` - Individual Q&A exchanges (for voice agents)
- `fairness_assessments` - Bias detection results

### Error Handling Strategy
- Agent fails → Log error to Phoenix → Continue to next agent with "N/A" data
- LiveKit connection drops → Auto-reconnect with transcript context
- Claude API rate limit → Exponential backoff, queue requests
- Database write fails → Retry 3x, then cache in Redis

## Demo Strategy

### What judges will see (5-minute demo):
1. **Resume upload** (candidate uploads PDF) - 30 seconds
2. **Live voice interview** (Agent 3 asks 1 technical question via voice) - 2 minutes
3. **Real-time Phoenix dashboard** (judges see agent reasoning, bias detection) - 1 minute
4. **Final recommendation** (system shows hire/no-hire with justification) - 1 minute
5. **Q&A** - 30 seconds

### What must work live:
- Resume upload → parsing
- Voice connection (microphone → LiveKit → agent → TTS → speaker)
- At least 1 voice question/answer exchange
- Phoenix dashboard showing live traces
- Final recommendation display

### What can be pre-recorded/faked:
- Full 6-agent pipeline (can show Agent 1, 3, 6 only)
- Multiple interview questions (can show 1 question instead of 5)
- Behavioral interview (can skip Agent 4 if time-constrained)
- Historical analytics (can show mock data)

## Testing Checklist

Before demo:
- [ ] Resume upload works (PDF → parsed JSON)
- [ ] LiveKit room creates successfully
- [ ] Microphone access granted in browser
- [ ] Agent 3 asks question via voice (TTS works)
- [ ] Candidate can speak (transcription works)
- [ ] Phoenix dashboard accessible (http://localhost:6006)
- [ ] Traces appear in Phoenix UI in real-time
- [ ] Final recommendation displays
- [ ] Can reset and run second interview

## Common Gotchas

### LangGraph
- **State type mismatches** - Ensure all agents return correct TypedDict structure
- **Conditional edges** - Test edge cases (what if resume_score = 0?)
- **Infinite loops** - Graph should always terminate

### LiveKit
- **Token expiration** - Tokens expire after 1 hour; regenerate for new interviews
- **Room cleanup** - Rooms persist after interview; must manually destroy
- **HTTPS required** - WebRTC requires HTTPS in production (use ngrok for demo)

### Arize Phoenix
- **Span context propagation** - Child spans must reference parent span ID
- **Sensitive data** - Don't log candidate PII to Phoenix (GDPR concern)
- **Local vs cloud** - Use local Phoenix server for hackathon (no API key needed)

### Claude API
- **Context window limits** - Claude 3.5 Sonnet has 200K context window, but keep prompts focused
- **Streaming vs completion** - Use streaming for voice (faster), completion for non-voice
- **Rate limits** - Tier 1 API keys = 50 requests/min (sufficient for demo)

## Environment Variables

Required in `.env`:
```
# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# LiveKit
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=secret...
LIVEKIT_URL=wss://...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/arete

# Redis
REDIS_URL=redis://localhost:6379

# Phoenix (optional, defaults to localhost:6006)
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006
```

## Success Criteria (Judge Perspective)

### LiveKit Track (Apple Watch + Internship)
- ✅ Real-time voice interaction (not text-to-speech playback)
- ✅ Multi-turn conversation (agent asks follow-up questions)
- ✅ Low latency (<200ms perceived delay)
- ✅ Multi-agent coordination visible (different agents have different voices/personalities)

### Arize Phoenix Track ($1,000)
- ✅ All agent steps traced in Phoenix UI
- ✅ Real-time dashboard accessible during demo
- ✅ Bias detection results visible (fairness agent outputs logged)
- ✅ Token usage, latency, and error rates captured

### Developer Tool Track ($500-2,000)
- ✅ Solves real problem (hiring bias, time-consuming interviews)
- ✅ Production-ready architecture (database, error handling, observability)
- ✅ Clear value proposition (saves recruiters X hours per hire)
- ✅ Auditable decisions (judges can see why system recommended hire/no-hire)

## AI Assistant Guidelines

When working on this project:

1. **Prioritize working demo over perfect code** - This is a 24-hour hackathon
2. **Ask clarifying questions early** - Don't guess at requirements
3. **Test incrementally** - Each agent should work in isolation before integration
4. **Document trade-offs** - If cutting scope, explain why
5. **Use concrete examples** - Show actual prompts, actual API calls, actual state objects
6. **Think like a judge** - What would impress someone evaluating this in 5 minutes?

## Next Steps

1. Set up development environment (Docker, PostgreSQL, Redis, Phoenix)
2. Implement Agent 1 (Resume Parser) as proof-of-concept
3. Build LangGraph scaffolding (state, graph construction, execution)
4. Integrate LiveKit (Agent 3 voice interaction)
5. Add Phoenix tracing (instrument all agents)
6. Build frontend (resume upload, interview room, results page)
7. End-to-end testing
8. Demo rehearsal

---

**Last Updated**: January 17, 2026
**Hackathon**: NexHacks 2026, CMU
**Team Size**: 2-3 engineers
**Build Time**: 24 hours
**Target Prizes**: LiveKit Agent Track, Arize Phoenix Track, Developer Tool Track
