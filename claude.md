# ARETE - AI Assistant Instructions

## Project Overview

ARETE is a **realistic AI technical interviewer** built for NexHacks 2026 at CMU. This is a **24-hour hackathon project** targeting three prize tracks:

1. **LiveKit Agent Track** - Apple Watch + Internship
2. **Arize Phoenix Track** - $1,000 cash
3. **Developer Tool Track** - $500-2,000

## What is ARETE?

ARETE is a cost-optimized AI interviewing platform that:
- Conducts **LeetCode-style technical interviews** for big tech SWE roles
- Uses a **realistic human avatar** via video call (LiveKit + D-ID)
- Provides **real-time code feedback** in a VS Code-style editor (Monaco)
- Employs **2 specialized AI agents** (Interviewer + Fairness Monitor)
- **Detects hiring bias** in real-time using Arize Phoenix observability
- Generates **recruiter dashboards** with scores, video recordings, and transcripts
- **Costs $0.40 per interview** vs. $200 for human interviewers (99% cost reduction)

## Core Technologies

### Backend
- **FastAPI** - Python web framework
- **LangGraph** - 2-agent orchestration framework
- **Claude API (Anthropic)** - LLM for both agents (Sonnet for Agent 1, Haiku for Agent 2)
- **PostgreSQL** - Primary database
- **Redis** - Caching and session management
- **LiveKit** - Real-time video + voice communication
- **D-ID** - Realistic avatar lip-sync ($0.10/min)
- **ElevenLabs** - Text-to-speech
- **Arize Phoenix** - Observability and bias detection

### Frontend
- **Next.js 14** - React framework
- **React 18** - UI library
- **TailwindCSS** - Styling
- **LiveKit React SDK** - WebRTC client
- **Monaco Editor** - VS Code-style code editor

## The 2-Agent System

### Agent 1: Technical Interviewer Agent

**Purpose:** Conduct live LeetCode interview via video call, watch code in real-time, provide hints, score performance

**Input:**
- Problem metadata (e.g., "Two Sum", difficulty, test cases, optimal solution)
- Live code snapshots (Monaco editor onChange events, debounced 1.5s)
- Conversation history (candidate voice input via LiveKit)
- Candidate name

**Behavior:**
1. **Present problem** - Avatar speaks via TTS: "Hi! I'm Sarah, your technical interviewer. Let's solve Two Sum today..."
2. **Monitor code** - Receives CODE_SNAPSHOT every 1.5 seconds
3. **Real-time analysis:**
   - **Typo/syntax error** → Ignore (let candidate fix themselves)
   - **Logical error** (e.g., nested loop when hash map would work) → **Interrupt via voice**: "I see you're using a nested loop. Can we optimize this?"
   - **Good approach** → Encourage: "Great! That's the right direction."
   - **Stuck** (no changes for 2+ minutes) → Proactive hint: "Need help? Think about using a hash map..."
4. **Execute code** - When candidate clicks "Run Code", execute in sandboxed Python subprocess, return test results
5. **Ask follow-ups** - "All tests passed! Can you explain the time complexity?"
6. **Score final solution:**
   - Correctness (0-10): Did it pass all test cases?
   - Optimization (0-10): Is time/space complexity optimal?
   - Code quality (0-10): Is code readable, well-structured?
   - Communication (0-10): Did candidate explain approach verbally?
   - Problem-solving (0-10): How did they approach the problem?

**Output:**
```python
{
  "interview_transcript": [
    {"speaker": "AI", "text": "Hi! Let's solve Two Sum...", "timestamp": "00:00"},
    {"speaker": "Candidate", "text": "Okay, so I'll use a hash map...", "timestamp": "00:15"}
  ],
  "code_submissions": [
    {"code": "def twoSum(nums, target):\n  ...", "timestamp": "00:45", "test_results": "2/5 passed"}
  ],
  "hints_given": [
    {"hint": "Think about O(1) lookups", "timestamp": "02:30", "reason": "nested loop detected"}
  ],
  "scores": {
    "correctness": 9,
    "optimization": 7,
    "code_quality": 8,
    "communication": 8,
    "problem_solving": 8,
    "overall": 8.0
  },
  "interviewer_notes": "Candidate initially used nested loop but corrected after hint. Good communication."
}
```

**Voice Interaction:** MULTI-TURN, real-time via LiveKit (15-25 minutes)

**LLM:** Claude 3.5 Sonnet (~20K tokens per interview)

---

### Agent 2: Fairness Monitor Agent

**Purpose:** Analyze completed interview for bias, normalize scores, flag issues

**Input:** Agent 1's complete output + candidate metadata (name, demographics if available)

**Behavior:**
1. **Transcript analysis:**
   - Did avatar ask inappropriate questions?
   - Were hints distributed fairly (not too many, not too few)?
   - Was tone consistent throughout?
   - Any microaggressions detected?
2. **Score normalization:**
   - Compare to historical data (same problem, same difficulty level)
   - Adjust for hint frequency (gave 3 hints → slightly lower raw score is acceptable)
   - Flag statistical anomalies (score 10/10 but took 5 hints? Suspicious)
3. **Bias detection:**
   - Check for language bias
   - Ensure question difficulty matched candidate level
   - Validate scoring consistency

**Output:**
```python
{
  "bias_detected": False,
  "fairness_score": 9.2,
  "flags": [],  # e.g., ["Excessive hints given", "Tone became impatient at 15:00"]
  "normalized_scores": {
    "correctness": 9,
    "optimization": 7,
    "code_quality": 8,
    "communication": 8,
    "problem_solving": 8,
    "overall": 8.0
  },
  "recommendation": "STRONG HIRE",
  "confidence": 0.87,
  "explanation": "Candidate demonstrated solid problem-solving skills. Needed one hint on optimization but recovered well. No bias detected."
}
```

**No voice interaction** - Runs asynchronously after interview completes

**LLM:** Claude 3 Haiku (~5K tokens per interview, cheaper)

---

## LangGraph Workflow

```python
from langgraph.graph import StateGraph
from typing import TypedDict

class InterviewState(TypedDict):
    # Input
    problem: dict  # {"name": "Two Sum", "difficulty": "Easy", ...}
    candidate_name: str

    # Agent 1 outputs
    interview_transcript: list[dict]
    code_submissions: list[dict]
    hints_given: list[dict]
    scores: dict
    interviewer_notes: str

    # Agent 2 outputs
    bias_detected: bool
    fairness_score: float
    flags: list[str]
    normalized_scores: dict
    recommendation: str
    confidence: float
    explanation: str

# Graph construction
workflow = StateGraph(InterviewState)

# Add nodes
workflow.add_node("interviewer", run_interviewer_agent)  # Agent 1 (15-25 min)
workflow.add_node("fairness_monitor", run_fairness_agent)  # Agent 2 (30 sec)

# Define edges
workflow.set_entry_point("interviewer")
workflow.add_edge("interviewer", "fairness_monitor")
workflow.add_edge("fairness_monitor", END)

# Compile
app = workflow.compile()

# Execute
final_state = app.invoke({
    "problem": {...},
    "candidate_name": "John Doe"
})
```

**State Management:**
- Immutable state updates (each agent returns new state fields)
- Snapshot to Redis after each agent (crash recovery)
- Never mutate state in-place

---

## Project Structure

```
nexhacks-26/
├── backend/
│   ├── app/
│   │   ├── main.py                      # FastAPI entry point
│   │   ├── state.py                     # InterviewState TypedDict
│   │   ├── graph.py                     # LangGraph construction
│   │   ├── models.py                    # Pydantic schemas
│   │   ├── database.py                  # SQLAlchemy ORM
│   │   ├── agents/
│   │   │   ├── agent_1_interviewer.py   # Technical interviewer logic
│   │   │   └── agent_2_fairness.py      # Fairness monitor logic
│   │   ├── integrations/
│   │   │   ├── livekit_client.py        # LiveKit SDK (video/voice)
│   │   │   ├── did_avatar.py            # D-ID API for avatar
│   │   │   ├── llm_client.py            # Claude API wrapper
│   │   │   ├── code_executor.py         # Python sandbox execution
│   │   │   └── phoenix_tracing.py       # OpenTelemetry setup
│   │   └── routers/
│   │       ├── interviews.py            # API endpoints
│   │       └── health.py                # Health check
│   ├── problems/                        # LeetCode problem database
│   │   ├── two_sum.json
│   │   ├── merge_intervals.json
│   │   └── ...
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.tsx                     # Landing page
│   │   ├── interview/
│   │   │   └── [id]/
│   │   │       └── page.tsx             # Live interview room
│   │   └── dashboard/
│   │       └── [id]/
│   │           └── page.tsx             # Recruiter results dashboard
│   ├── components/
│   │   ├── LiveKitRoom.tsx              # Video call wrapper
│   │   ├── AvatarVideo.tsx              # D-ID avatar display
│   │   ├── CodeEditor.tsx               # Monaco editor wrapper
│   │   ├── TestResults.tsx              # Code execution output
│   │   └── ScoresDashboard.tsx          # Final scores display
│   ├── lib/
│   │   └── api.ts                       # Backend API client
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── prd.md                               # Product requirements (this file is the source of truth)
├── claude.md                            # AI assistant instructions (this file)
└── README.md                            # User-facing documentation
```

---

## Critical Implementation Notes

### 1. LiveKit Video + Voice Integration

**Room Lifecycle:**
1. Frontend calls `POST /api/interviews/start` → Backend creates LiveKit room
2. Backend generates access token (JWT) for candidate
3. Frontend receives token → Connects to LiveKit room via WebRTC
4. **Avatar stream:** D-ID generates video stream (lip-synced with TTS audio) → Pushed to LiveKit room
5. **Candidate stream:** Webcam/mic → LiveKit room → Backend receives audio transcription
6. **Conversation:** Agent 1 speaks via TTS → D-ID lip-sync → LiveKit → Candidate hears/sees avatar
7. Interview ends → Backend destroys LiveKit room

**Key APIs:**
```python
from livekit import api, rtc

# Create room
room = await livekit_client.create_room(name=f"interview-{interview_id}")

# Generate token
token = api.AccessToken()
token.with_identity(candidate_name)
token.with_grants(api.VideoGrants(room_join=True, room=room.name))

# Push avatar video stream (from D-ID)
avatar_track = await did_client.create_stream(audio=tts_audio)
await room.local_participant.publish_track(avatar_track)
```

**Latency Target:** <2 seconds (candidate speaks → Agent 1 analyzes → TTS → avatar responds)

---

### 2. Monaco Editor Integration (Real-time Code Watching)

**Frontend:**
```tsx
import Editor from '@monaco-editor/react';

function CodeEditor({ interviewId }) {
  const [code, setCode] = useState('');

  // Debounce onChange to avoid spamming backend
  const debouncedSend = useDebouncedCallback((code) => {
    fetch(`/api/interviews/${interviewId}/code-snapshot`, {
      method: 'POST',
      body: JSON.stringify({ code, timestamp: Date.now() })
    });
  }, 1500);  // 1.5 second debounce

  return (
    <Editor
      language="python"
      value={code}
      onChange={(value) => {
        setCode(value);
        debouncedSend(value);  // Send to Agent 1
      }}
    />
  );
}
```

**Backend (Agent 1 receives snapshot):**
```python
@router.post("/interviews/{interview_id}/code-snapshot")
async def receive_code_snapshot(interview_id: str, snapshot: CodeSnapshot):
    # Add to interview state
    state = get_interview_state(interview_id)
    state["current_code"] = snapshot.code

    # Trigger Agent 1 analysis
    analysis = await agent_1_analyze_code(
        code=snapshot.code,
        problem=state["problem"],
        conversation_history=state["transcript"]
    )

    # If analysis suggests hint/interruption, send TTS to LiveKit
    if analysis["should_interrupt"]:
        await livekit_speak(analysis["message"])

    return {"status": "received"}
```

---

### 3. D-ID Avatar Integration (Cost-Optimized)

**Why D-ID?**
- **Realistic** lip-sync (better than Ready Player Me 3D avatars)
- **Cheap** ($0.10/min vs. $30/min for Synthesia)
- **Easy** API (just send audio, get video stream)

**Implementation:**
```python
import requests

DID_API_URL = "https://api.d-id.com/talks/streams"

async def create_avatar_stream(audio_url: str):
    response = requests.post(
        DID_API_URL,
        headers={"Authorization": f"Bearer {DID_API_KEY}"},
        json={
            "source_url": "https://path/to/professional-headshot.jpg",  # Static photo
            "driver_url": audio_url,  # TTS audio from ElevenLabs
            "config": {"stitch": True}
        }
    )
    stream_url = response.json()["stream_url"]
    return stream_url  # Push this to LiveKit
```

**Demo Optimization:**
- Use **one high-quality professional headshot** (upload once)
- Generate TTS audio with ElevenLabs → Send to D-ID for lip-sync
- D-ID returns video stream → Push to LiveKit room

**Alternative (if D-ID too expensive for demo):**
- Use **static image** + **audio waveform visualization** (free, shows concept)
- Pitch D-ID as "production implementation" to judges

---

### 4. Code Execution Sandbox (Python Only)

**Security:** Use subprocess with timeout, no network access, limited CPU/memory

```python
import subprocess
import tempfile

def execute_python_code(code: str, test_cases: list) -> dict:
    # Write code to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(code)
        temp_path = f.name

    results = []
    for test in test_cases:
        try:
            # Run with timeout, capture stdout/stderr
            proc = subprocess.run(
                ['python', temp_path],
                input=test["input"],
                capture_output=True,
                timeout=5,  # 5 second limit
                text=True
            )
            passed = proc.stdout.strip() == test["expected_output"]
            results.append({"test": test["name"], "passed": passed, "output": proc.stdout})
        except subprocess.TimeoutExpired:
            results.append({"test": test["name"], "passed": False, "error": "Timeout"})

    return {"results": results, "total_passed": sum(r["passed"] for r in results)}
```

**For Hackathon:** Basic subprocess is fine. In production, use Docker containers or AWS Lambda for isolation.

---

### 5. Arize Phoenix Tracing (Observability)

**Setup:**
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Initialize Phoenix tracer
tracer_provider = TracerProvider()
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:6006/v1/traces"))
)
trace.set_tracer_provider(tracer_provider)
tracer = trace.get_tracer(__name__)
```

**Instrument Agent 1:**
```python
with tracer.start_as_current_span("agent_1_interviewer") as span:
    span.set_attribute("interview_id", interview_id)
    span.set_attribute("problem", "Two Sum")

    # Present problem
    with tracer.start_as_current_span("present_problem"):
        response = await claude_api.call(prompt="Introduce the Two Sum problem...")
        span.set_attribute("llm.response", response)
        span.set_attribute("llm.tokens", 1200)

    # Watch code (multiple snapshots)
    for snapshot in code_snapshots:
        with tracer.start_as_current_span(f"analyze_snapshot_{snapshot.id}"):
            analysis = await claude_api.call(prompt=f"Analyze this code: {snapshot.code}")
            span.set_attribute("code_quality", analysis["score"])
            if analysis["should_interrupt"]:
                span.set_attribute("hint_given", analysis["hint"])

    # Final scoring
    with tracer.start_as_current_span("score_solution"):
        scores = calculate_scores(...)
        span.set_attribute("final_score", scores["overall"])
```

**Instrument Agent 2:**
```python
with tracer.start_as_current_span("agent_2_fairness_monitor"):
    # Bias detection
    with tracer.start_as_current_span("detect_bias"):
        bias_analysis = await claude_api.call(prompt="Analyze this transcript for bias...")
        span.set_attribute("bias_detected", bias_analysis["bias_detected"])
        span.set_attribute("fairness_score", bias_analysis["fairness_score"])
```

**Phoenix Dashboard (localhost:6006):**
- Root span: `interview_session_{id}` (20-25 minutes duration)
  - Child span: `agent_1_interviewer` (20 minutes, 18.5K tokens)
    - Grandchild spans: `present_problem`, `analyze_snapshot_1`, `give_hint`, `score_solution`
  - Child span: `agent_2_fairness_monitor` (30 seconds, 4.2K tokens)
    - Grandchild span: `detect_bias`

**What Judges See:**
- Real-time trace updates as interview progresses
- Exact prompts sent to Claude API
- Token usage per agent
- Latency per operation
- Bias detection reasoning (why fairness score = 9.2?)

---

## Development Workflow

### Setting Up (Hour 0-2)

1. **Clone repo and install dependencies:**
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install

# Start Phoenix locally
docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Add API keys: ANTHROPIC_API_KEY, LIVEKIT_*, ELEVENLABS_API_KEY, DID_API_KEY
```

3. **Start databases:**
```bash
docker-compose up -d postgres redis
```

4. **Run migrations:**
```bash
alembic upgrade head
```

### Building (Hour 2-20)

**Hour 2-4:** FastAPI skeleton + database schema
- `models.py`: Pydantic schemas
- `database.py`: SQLAlchemy tables (candidates, interviews, scores)
- `main.py`: Basic endpoints (`POST /interviews/start`, `GET /interviews/{id}`)

**Hour 4-8:** Agent 1 (Interviewer)
- `agents/agent_1_interviewer.py`: Core logic
- `integrations/llm_client.py`: Claude API wrapper
- `integrations/code_executor.py`: Python sandbox
- Test agent in isolation (no LiveKit yet, just API calls)

**Hour 8-10:** LiveKit + D-ID integration
- `integrations/livekit_client.py`: Room creation, token generation
- `integrations/did_avatar.py`: Avatar stream creation
- Test video call with static avatar (no agent yet)

**Hour 10-12:** Connect Agent 1 to LiveKit
- CODE_SNAPSHOT endpoint receives Monaco changes
- Agent 1 analyzes code, triggers TTS via LiveKit
- Test end-to-end interview (1 problem, 5 minutes)

**Hour 12-14:** Agent 2 (Fairness Monitor) + LangGraph
- `agents/agent_2_fairness.py`: Bias detection logic
- `graph.py`: LangGraph orchestration (Agent 1 → Agent 2)
- Test full pipeline

**Hour 14-16:** Arize Phoenix tracing
- `integrations/phoenix_tracing.py`: OpenTelemetry setup
- Instrument both agents with spans
- Verify traces appear in Phoenix UI

**Hour 16-18:** Frontend (Next.js)
- `app/interview/[id]/page.tsx`: Interview room (Monaco + LiveKit)
- `app/dashboard/[id]/page.tsx`: Recruiter dashboard
- `components/CodeEditor.tsx`, `components/AvatarVideo.tsx`

**Hour 18-20:** End-to-end testing + bug fixes
- Run full interview from start to finish
- Fix edge cases (code execution timeout, avatar connection drops, etc.)
- Record demo video (backup in case live demo fails)

**Hour 20-24:** Demo prep + polish
- Prepare 5-minute demo script
- Load sample problems (Two Sum, Merge Intervals)
- Test on different browsers
- Polish UI (remove debug logs, add loading states)
- Prepare answers to judge questions

---

## Testing Strategy

### Unit Tests (Agent Logic)
```python
# tests/test_agent_1.py
def test_agent_1_detects_logical_error():
    code = "def twoSum(nums, target):\n  for i in range(len(nums)):\n    for j in range(len(nums)):"
    analysis = analyze_code_snapshot(code, problem="Two Sum")
    assert analysis["should_interrupt"] == True
    assert "nested loop" in analysis["hint"].lower()

def test_agent_1_encourages_good_approach():
    code = "def twoSum(nums, target):\n  seen = {}"
    analysis = analyze_code_snapshot(code, problem="Two Sum")
    assert analysis["should_interrupt"] == False or "great" in analysis["message"].lower()
```

### Integration Tests (LangGraph)
```python
# tests/test_graph.py
async def test_full_interview_pipeline():
    state = {
        "problem": load_problem("two_sum"),
        "candidate_name": "Test User"
    }
    final_state = await app.invoke(state)

    assert "scores" in final_state
    assert "normalized_scores" in final_state
    assert "bias_detected" in final_state
    assert final_state["recommendation"] in ["STRONG HIRE", "HIRE", "NO HIRE"]
```

### Manual Testing Checklist
- [ ] LiveKit room creates successfully
- [ ] Avatar video appears in interview room
- [ ] Candidate can speak (transcription works)
- [ ] Monaco editor sends CODE_SNAPSHOT every 1.5s
- [ ] Agent 1 interrupts on logical errors
- [ ] "Run Code" button executes Python correctly
- [ ] Interview completes → Dashboard shows scores
- [ ] Phoenix dashboard shows traces in real-time
- [ ] Fairness agent detects obvious bias (test with biased transcript)

---

## Cost Optimization (VC Pitch Key Points)

### Per-Interview Cost Breakdown
```
LLM (Claude API):
  • Agent 1 (Interviewer): 20K tokens @ $3/1M = $0.06
  • Agent 2 (Fairness): 5K tokens @ $0.60/1M = $0.003

Infrastructure:
  • LiveKit: $0.004/min × 20 min = $0.08
  • ElevenLabs TTS: $0.30/10K chars = $0.15
  • D-ID Avatar: $0.10/min × 20 min = $2.00
  • Storage (video): $0.01
  • Compute (FastAPI): $0.10

TOTAL: $2.40/interview
```

**With volume discounts (10K interviews/month):**
- D-ID: Negotiate to $0.05/min → $1.00/interview
- LiveKit: Committed use discount → $0.04/interview
- **New total: $1.35/interview**

**Compared to human interviewer:**
- Human: $200/hr × 1 hr = $200
- ARETE: $1.35
- **Savings: 99.3%**

### Scaling Economics
```
Scenario: Mid-sized tech company (1,000 interviews/month)

Traditional Cost:
  • 1,000 interviews × $200 = $200,000/month
  • Need 20+ senior engineers as interviewers
  • Scheduling overhead: ~500 hours/month

ARETE Cost:
  • 1,000 interviews × $1.35 = $1,350/month
  • Same infrastructure (no new servers needed)
  • Zero scheduling (24/7 availability)

ROI: $198,650/month = $2.38M/year
```

**Revenue Model:**
- Charge $10/interview (7× markup)
- Or: $15K/month for unlimited interviews (enterprise tier)
- Target: 100 companies → **$1.5M ARR**

---

## Demo Script (5 Minutes)

**[0:00-0:30] Introduction**
- "Hi judges! This is ARETE, an AI technical interviewer that costs $1.35 per interview instead of $200."
- "We're targeting the LiveKit, Arize Phoenix, and Developer Tool tracks."
- Click "Start Interview" → Room loads

**[0:30-1:00] Avatar Introduction**
- Avatar appears: "Hi! I'm Sarah, your technical interviewer. Let's solve Two Sum today."
- Point out: "This is a realistic avatar using D-ID lip-sync, not a chatbot."

**[1:00-3:00] Live Coding + Real-time Hints**
- Start typing code in Monaco editor
- At 1:30, write inefficient nested loop
- Avatar interrupts: "I see you're using nested loops. Can we optimize?"
- Correct to hash map approach
- Click "Run Code" → Tests pass ✅
- Avatar: "Perfect! Can you explain the time complexity?"
- Answer verbally: "O(n) time, O(n) space"

**[3:00-3:30] Recruiter Dashboard**
- Interview ends, transition to dashboard
- Show scores:
  - Correctness: 9/10
  - Optimization: 7/10 (needed hint)
  - Communication: 8/10
  - Overall: 8.0/10 → STRONG HIRE
- Show fairness report: "No bias detected"
- Download buttons: [Video] [Transcript]

**[3:30-4:15] Phoenix Dashboard (Arize Track)**
- Switch to `localhost:6006`
- Show trace hierarchy:
  ```
  interview_session_123 (20.3 sec)
    ├─ agent_1_interviewer (19.5 sec, 18.5K tokens)
    │   ├─ present_problem (2.1 sec)
    │   ├─ analyze_snapshot_1 (1.8 sec)
    │   ├─ give_hint (2.3 sec)  ← Click to see reasoning
    │   └─ score_solution (1.2 sec)
    └─ agent_2_fairness_monitor (0.8 sec, 4.2K tokens)
        └─ detect_bias (0.8 sec)  ← No flags
  ```
- Click on `give_hint` span → Show exact prompt sent to Claude
- Highlight token usage: "Only 18.5K tokens for a full interview"

**[4:15-4:45] Cost Pitch**
- "Traditional interview: $200. ARETE: $1.35. That's 99% cost savings."
- "A company doing 1,000 interviews/month saves $2.4M/year."
- "Our 2-agent system (LangGraph) ensures fairness while keeping costs low."

**[4:45-5:00] Q&A**
- Be ready to answer:
  - "How do you prevent cheating?" → Monitor for copy-paste, track timing
  - "What about other languages?" → Python for demo, but architecture supports any language
  - "How scalable?" → Same infra handles 10K concurrent interviews (LiveKit + serverless)

---

## Common Gotchas & Troubleshooting

### LiveKit Issues
- **Room doesn't create** → Check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`
- **No video/audio** → Ensure HTTPS (WebRTC requires secure context). Use ngrok for local testing.
- **Avatar not appearing** → D-ID API might be slow (2-3 sec to generate stream). Show loading state.

### LangGraph Issues
- **State not updating** → Ensure agents return new state dict (don't mutate in-place)
- **Agent 2 doesn't run** → Check edge definition: `workflow.add_edge("interviewer", "fairness_monitor")`
- **Infinite loop** → Should never happen (linear pipeline: Agent 1 → Agent 2 → END)

### Phoenix Issues
- **Traces not appearing** → Check Phoenix server is running (`docker ps | grep phoenix`)
- **Spans missing attributes** → Ensure `span.set_attribute()` called before span ends
- **Can't access UI** → Navigate to `http://localhost:6006` (not 127.0.0.1)

### Code Execution Issues
- **Timeout** → Candidate's code has infinite loop. Subprocess timeout (5 sec) should catch this.
- **Import errors** → Sandbox doesn't have all packages. For demo, only support stdlib.
- **Security** → Don't worry about jailbreaks for hackathon. In production, use Docker.

### Cost Overruns
- **D-ID too expensive** → Fallback to static image + audio waveform (free)
- **Claude API rate limits** → Tier 1 = 50 req/min. Should be fine for demo (1 interview at a time).
- **LiveKit charges** → First 10K minutes free. Demo uses ~20 min total.

---

## Success Metrics (What Judges Care About)

### LiveKit Track ✅
- **Real-time video/voice** - Candidate and avatar talk via WebRTC
- **Multi-agent orchestration** - 2 agents collaborate (visible in Phoenix)
- **Low latency** - Avatar responds <2 sec after code change

### Arize Phoenix Track ✅
- **Full observability** - Every agent decision traced
- **Real-time dashboard** - Judges see live traces during interview
- **Bias detection** - Fairness agent outputs logged and queryable

### Developer Tool Track ✅
- **Solves real problem** - Replaces $200/hr interviewers with $1.35 AI
- **Production-ready architecture** - FastAPI, LangGraph, database, error handling
- **Clear ROI** - 99% cost reduction, saves $2.4M/year for mid-sized company

---

## AI Assistant Guidelines (For Claude Code)

When working on this project:

1. **Read PRD first** - `/prd.md` is the source of truth. This file supplements it.
2. **Prioritize demo** - Focus on what judges will see in 5 minutes, not perfect production code.
3. **Cost-conscious** - Always think "How can we make this cheaper?" (e.g., use Haiku for Agent 2).
4. **Test incrementally** - Build Agent 1 first, test in isolation, then add Agent 2.
5. **Document trade-offs** - If cutting scope, explain why (e.g., "Skipping resume parsing to focus on interview quality").
6. **Phoenix first** - Instrument early. Judges love seeing traces in real-time.
7. **Avatar fallback** - If D-ID fails, use static image + waveform. Show concept, not perfection.

---

**Last Updated:** January 17, 2026
**Hackathon:** NexHacks 2026, CMU
**Team Size:** 2-3 engineers
**Build Time:** 24 hours
**Target Prizes:** LiveKit Agent Track, Arize Phoenix Track, Developer Tool Track
