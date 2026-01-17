# The Code Proctor - AI Technical Interviewer

**One-Liner:** An AI interviewer that watches you code via a live editor, runs your code in a sandbox, and interrupts you verbally when you introduce a logical error—like a real senior engineer.

**Strategy:** Using **OpenRouter** (Llama 3.1 70B) for cheap, fast inference. Optimizing for low latency and active interruption (not passive chat).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Monaco Editor (Live)                       │   │
│  │     → onChange debounce (1.5s) → CODE_SNAPSHOT data packet   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐     │
│  │  Voice Chat  │  │  Run Button  │  │  /recruiter Dashboard  │     │
│  └──────────────┘  └──────────────┘  └────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   BACKEND (livekit-agents Python)                    │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │  Conversation       │    │  Analysis Thread    │                 │
│  │  Thread (OpenRouter)│◄───┤  (Code Watcher)     │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  EXECUTION HARNESS: inject fn → run tests → structured result  ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  EVENT LOG: CODE_SNAPSHOT | INTERRUPT | RUN_RESULT | VERDICT   ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
         │                             │
         ▼                             ▼
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │  LiveKit    │  │ OpenRouter  │  │ ElevenLabs  │  │Arize Phoenix│
  │  (WebRTC)   │  │(Llama 3.1)  │  │   (TTS)     │  │  (Traces)   │
  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Problem Bank (Content Layer)

In-repo problem definitions give the interviewer ground truth for analysis.

```python
# problems/merge_intervals.py
PROBLEM = {
    "id": "merge_intervals",
    "title": "Merge Intervals",
    "prompt": """Given an array of intervals where intervals[i] = [start, end],
merge all overlapping intervals and return an array of non-overlapping intervals.""",
    "starter_code": """def merge(intervals: list[list[int]]) -> list[list[int]]:
    # Your code here
    pass""",
    "constraints": [
        "1 <= intervals.length <= 10^4",
        "intervals[i].length == 2",
        "0 <= start <= end <= 10^4"
    ],
    "optimal_approach": "Sort by start time, then merge overlaps. O(n log n).",
    "test_cases": [
        {"input": [[1,3],[2,6],[8,10],[15,18]], "expected": [[1,6],[8,10],[15,18]]},
        {"input": [[1,4],[4,5]], "expected": [[1,5]]},
        {"input": [[1,4],[2,3]], "expected": [[1,4]]},
    ]
}
```

---

## Execution Harness (Grader)

Wraps candidate code, runs test cases, returns structured results.

```python
# harness/runner.py
def run_tests(candidate_code: str, problem: dict) -> dict:
    """
    1. Inject candidate function into namespace
    2. Run against test_cases
    3. Return structured result
    """
    result = {
        "passed": 0,
        "failed": 0,
        "total": len(problem["test_cases"]),
        "details": [],
        "stderr": None
    }
    
    try:
        exec(candidate_code, namespace := {})
        fn = namespace.get("merge")  # or problem["function_name"]
        
        for i, tc in enumerate(problem["test_cases"]):
            actual = fn(tc["input"])
            passed = actual == tc["expected"]
            result["passed" if passed else "failed"] += 1
            if not passed:
                result["details"].append({
                    "case": i + 1,
                    "input": tc["input"],
                    "expected": tc["expected"],
                    "actual": actual
                })
    except Exception as e:
        result["stderr"] = str(e)
    
    return result
```

---

## Event Log Pipeline

Unified event schema drives dashboard, reports, and traces.

```python
# events.py
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

EventType = Literal["CODE_SNAPSHOT", "INTERRUPT", "ENCOURAGE", "RUN_RESULT", "HINT_GIVEN", "FINAL_VERDICT"]

@dataclass
class InterviewEvent:
    type: EventType
    timestamp: datetime
    session_id: str
    payload: dict  # type-specific data

# In-memory store (upgrade to Redis/DB later)
EVENT_LOG: list[InterviewEvent] = []

def log_event(event_type: EventType, session_id: str, payload: dict):
    EVENT_LOG.append(InterviewEvent(
        type=event_type,
        timestamp=datetime.now(),
        session_id=session_id,
        payload=payload
    ))
```

**Event Types:**
| Event | Payload |
|-------|---------|
| `CODE_SNAPSHOT` | `{code, line_count}` |
| `INTERRUPT` | `{message, flaw_type}` |
| `ENCOURAGE` | `{message}` |
| `RUN_RESULT` | `{passed, failed, stderr}` |
| `FINAL_VERDICT` | `{decision, summary, flags}` |

---

## Recruiter Dashboard (`/recruiter`)

Live view + final report card. In-memory, fake-data ready for demo.

**Live View:**
```
┌────────────────────────────────────────────────────────────────┐
│  CANDIDATE: demo_user_123          STATUS: 🟢 In Progress      │
├────────────────────────────────────────────────────────────────┤
│  Problem: Merge Intervals                                       │
│  Time Elapsed: 12:34                                            │
│  Interrupts: 2    Encouragements: 3    Runs: 4 (3 pass)        │
└────────────────────────────────────────────────────────────────┘
```

**Final Report Card (generated from EVENT_LOG):**
```
┌────────────────────────────────────────────────────────────────┐
│  VERDICT: ✅ HIRE                                               │
├────────────────────────────────────────────────────────────────┤
│  Problem Solving: Strong                                        │
│  Code Quality: Good (minor style issues)                        │
│  Communication: Excellent                                       │
├────────────────────────────────────────────────────────────────┤
│  Key Flags:                                                     │
│  • Initially attempted O(n²), self-corrected after prompt       │
│  • Clean variable naming                                        │
│  • Asked clarifying questions before coding                     │
├────────────────────────────────────────────────────────────────┤
│  Summary: Candidate demonstrated strong algorithmic thinking.   │
│  Recovered well from initial suboptimal approach when prompted. │
└────────────────────────────────────────────────────────────────┘
```

---

## Core Logic: The Proctor Loop

**Context-Aware:** Agent has the problem definition + optimal approach.

```
Receive CODE_SNAPSHOT → Send to LLM with problem context
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  DECISION TREE  │
                            ├─────────────────┤
                            │ TYPO → IGNORE   │
                            │ LOGIC FLAW →    │  INTERRUPT
                            │ RIGHT APPROACH →│  ENCOURAGE
                            └─────────────────┘
                                     │
                                     ▼
                    log_event() + api.play_tts(feedback)
```

---

## Tech Stack

### Frontend
```json
{
  "livekit-client": "^2.7.0",
  "@monaco-editor/react": "^4.6.0",
  "lucide-react": "^0.400.0"
}
```

### Backend
```text
livekit-agents>=0.8.0
livekit-plugins-openai>=0.6.0
livekit-plugins-elevenlabs>=0.6.0
livekit-plugins-deepgram>=0.6.0
arize-phoenix
python-dotenv
```

---

## Environment Variables

```bash
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
OPENROUTER_API_KEY=sk-or-v1-...
ELEVEN_API_KEY=...
PHOENIX_API_KEY=...
PHOENIX_COLLECTOR_ENDPOINT=...
```

---

## Submission Requirements

### README Must Include:
- [ ] **How to run locally** (even if hacky: `pip install -r requirements.txt && python agent.py`)
- [ ] **External tools/libraries credits** (LiveKit, OpenRouter, ElevenLabs, Arize, Monaco)
- [ ] **Architecture overview** (can link to this PRD)
- [ ] **Demo video link** (optional but recommended)

### Repo Checklist:
- [ ] Code accessible via public GitHub link
- [ ] `.env.example` with placeholder keys
- [ ] `requirements.txt` and `package.json` complete
- [ ] No secrets committed

---

## Out of Scope (24hr)

- Authentication, production scaling, email notifications
- Multiple languages (Python only), video recording, mobile
- Persistent storage (in-memory only)

---

*NexHacks 2026 — Build fast, ship faster.* 🚀