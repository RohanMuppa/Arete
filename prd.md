# ARETE - AI Interview Orchestration Platform
## Product Requirements Document (PRD)

**Version:** 1.0 | **Date:** January 2026 | **Event:** NexHacks 2026 (CMU)

---

## 1. Executive Summary

ARETE is a multi-agent AI system that conducts end-to-end technical and behavioral interviews via real-time voice, scores candidates across multiple dimensions, detects bias in real-time, and produces auditable hiring recommendations.

**Target Tracks:** LiveKit Agent Track, Arize Phoenix Track, Developer Tool Track

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │  Upload  │  │  Live    │  │ Results  │  │ Recruiter        │    │
│  │  Resume  │  │Interview │  │Dashboard │  │ Dashboard        │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘    │
└───────┼─────────────┼─────────────┼─────────────────┼───────────────┘
        │             │             │                 │
        ▼             ▼             ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    LangGraph Orchestrator                    │    │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐      │    │
│  │  │ A1  │→│ A2  │→│ A3  │→│ A4  │→│ A5  │→│ A6  │      │    │
│  │  │Parse│  │Strat│  │Tech │  │Behav│  │Fair │  │Rec  │      │    │
│  │  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└───────┬─────────────┬─────────────┬─────────────────┬───────────────┘
        │             │             │                 │
        ▼             ▼             ▼                 ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐      ┌─────────────┐
   │PostgreSQL│  │  Redis  │  │ LiveKit │      │Arize Phoenix│
   │(persist) │  │ (cache) │  │ (voice) │      │(observability)│
   └─────────┘  └─────────┘  └─────────┘      └─────────────┘
                                   │
                                   ▼
                            ┌─────────────┐
                            │  Claude API │
                            │   (LLM)     │
                            └─────────────┘
```

---

## 3. The 6 Agents

| Agent | Purpose | Input | Output | Voice? |
|-------|---------|-------|--------|--------|
| **A1: Resume Parser** | Extract skills, experience, red flags | Raw PDF/text | Structured profile JSON | No |
| **A2: Strategy Planner** | Create personalized interview plan | Profile + job req | Question bank, focus areas | No |
| **A3: Technical Interviewer** | Conduct coding/system design interview | Strategy + profile | Transcript, scores (0-100) | **Yes** |
| **A4: Behavioral Interviewer** | Assess soft skills via STAR method | Strategy + profile | Transcript, scores (0-100) | **Yes** |
| **A5: Fairness Monitor** | Detect bias in real-time | All transcripts, scores | Bias flags, adjusted scores | No |
| **A6: Recommendation Engine** | Final hire/no-hire decision | All agent outputs | Decision + justification | No |

---

## 4. Core User Flows

### Flow 1: Recruiter Uploads Resume
1. Upload PDF → A1 parses → A2 generates strategy
2. System creates interview room (LiveKit)
3. Candidate receives link

### Flow 2: Candidate Interview
1. Join room → A3 conducts technical (10-15 min)
2. A4 conducts behavioral (10-15 min)
3. A5 monitors throughout for bias
4. A6 generates recommendation

### Flow 3: Recruiter Reviews
1. View real-time dashboard during interview
2. See final scores, transcripts, bias flags
3. Export auditable report

---

## 5. Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TailwindCSS, LiveKit JS SDK |
| Backend | FastAPI, LangGraph, Python 3.11+ |
| LLM | Claude 3.5 Sonnet (Anthropic API) |
| Voice | LiveKit (WebRTC), Deepgram (STT), ElevenLabs (TTS) |
| Database | PostgreSQL 15, Redis 7 |
| Observability | Arize Phoenix, OpenTelemetry |
| Deployment | Docker, docker-compose |

---

## 6. Data Models

### InterviewState (LangGraph)
```python
class InterviewState(TypedDict):
    interview_id: str
    candidate_id: str
    resume_text: str
    parsed_profile: dict          # A1 output
    interview_strategy: dict      # A2 output
    technical_transcript: list    # A3 output
    technical_score: float
    behavioral_transcript: list   # A4 output
    behavioral_score: float
    bias_flags: list              # A5 output
    final_recommendation: dict    # A6 output
    current_agent: str
    error: Optional[str]
```

### Database Tables
- `candidates` (id, name, email, resume_url, created_at)
- `interviews` (id, candidate_id, status, started_at, ended_at)
- `agent_decisions` (id, interview_id, agent_name, input_json, output_json, latency_ms)
- `scores` (id, interview_id, dimension, score, reasoning)
- `fairness_assessments` (id, interview_id, bias_type, severity, recommendation)

---

## 7. API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/interviews` | Create new interview |
| POST | `/api/interviews/{id}/upload-resume` | Upload candidate resume |
| GET | `/api/interviews/{id}` | Get interview status |
| POST | `/api/interviews/{id}/start` | Start interview (creates LiveKit room) |
| GET | `/api/interviews/{id}/token` | Get LiveKit participant token |
| WS | `/api/interviews/{id}/ws` | Real-time updates |
| GET | `/api/interviews/{id}/results` | Get final results |
| GET | `/api/interviews/{id}/traces` | Get Phoenix trace data |

---

## 8. LiveKit Voice Flow

```
Candidate Mic → WebRTC → LiveKit Server → Deepgram STT
                                              ↓
                                         Transcript
                                              ↓
                                      Claude (Agent)
                                              ↓
                                         Response
                                              ↓
                                      ElevenLabs TTS
                                              ↓
LiveKit Server ← Audio ← TTS Audio
      ↓
Candidate Speaker
```

**Latency Target:** <500ms end-to-end

---

## 9. Arize Phoenix Integration

**Trace Hierarchy:**
```
interview_trace (root)
├── resume_parser_span
├── strategy_planner_span
├── technical_interview_span
│   ├── turn_1_span
│   ├── turn_2_span
│   └── ...
├── behavioral_interview_span
├── fairness_monitor_span
└── recommendation_span
```

**Captured Attributes:**
- `input_text`, `output_text`, `tokens_used`, `latency_ms`
- `agent_name`, `turn_number`, `score`, `reasoning`
- `bias_detected`, `bias_type`, `mitigation_applied`

---

## 10. 24-Hour Build Timeline

| Hours | Milestone | Deliverable |
|-------|-----------|-------------|
| 0-2 | Setup | Repo, Docker, env vars |
| 2-4 | Backend skeleton | FastAPI + DB + basic endpoints |
| 4-8 | Core agents | A1-A4 working with LangGraph |
| 8-10 | LiveKit | Voice interview functional |
| 10-12 | Fairness + Rec | A5, A6 complete |
| 12-14 | Phoenix | Full tracing instrumented |
| 14-18 | Frontend | Dashboard + interview UI |
| 18-20 | Integration | End-to-end testing |
| 20-24 | Polish | Demo prep, bug fixes |

---

## 11. Risk Mitigation

| Risk | Likelihood | Mitigation | Fallback |
|------|------------|------------|----------|
| LiveKit complexity | High | Use their Python agent template | Text-only mode |
| Token cost explosion | Medium | Budget per agent, caching | Use Haiku for A1/A2 |
| Phoenix integration | Low | Follow official docs | Console logging |
| State corruption | Medium | Immutable updates, Redis backup | Restart interview |
| Demo failure | Medium | Pre-record backup video | Show traces only |

---

## 12. Success Criteria

**For LiveKit Track:**
- [ ] Real-time voice interview works
- [ ] <500ms latency
- [ ] Graceful reconnection

**For Arize Phoenix Track:**
- [ ] Full trace visibility
- [ ] Bias detection visible in dashboard
- [ ] Query traces by interview ID

**For Developer Tool Track:**
- [ ] Clean API design
- [ ] Comprehensive docs
- [ ] Easy local setup

---

## 13. Out of Scope (24hr)

- User authentication (use hardcoded tokens)
- Production scaling (single instance fine)
- Email notifications
- Resume parsing from LinkedIn
- Video (audio only)
- Mobile app

---

## 14. Dependencies

```txt
# Python
fastapi==0.109.0
langgraph==0.0.40
livekit==0.11.0
livekit-agents==0.7.0
anthropic==0.18.0
arize-phoenix==3.0.0
opentelemetry-api==1.22.0
sqlalchemy==2.0.25
asyncpg==0.29.0
redis==5.0.1
python-multipart==0.0.6

# Node (frontend)
next@14.1.0
react@18.2.0
@livekit/components-react@2.0.0
tailwindcss@3.4.0
```

---

*Document generated for NexHacks 2026. Build fast, ship faster.* 🚀