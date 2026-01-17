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
│  │  Voice Chat  │  │  Run Button  │  │  Recruiter Dashboard   │     │
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
│  │  EXECUTION ENGINE: subprocess → temp.py → stdout/stderr        ││
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

## Core Logic: The Proctor Loop

**Context-Aware:** The agent knows the active problem (e.g., "Merge Intervals") and the optimal solution.

```
Receive CODE_SNAPSHOT → Send to LLM with problem context
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  DECISION TREE  │
                            ├─────────────────┤
                            │ TYPO → IGNORE   │  (Let them fix it)
                            │ LOGIC FLAW →    │  INTERRUPT with question
                            │ RIGHT APPROACH →│  ENCOURAGE progress
                            └─────────────────┘
                                     │
                                     ▼
                         api.play_tts(feedback)
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
# LiveKit
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

# OpenRouter (LLM)
OPENROUTER_API_KEY=sk-or-v1-...

# ElevenLabs (TTS)
ELEVEN_API_KEY=...

# Arize (Observability)
PHOENIX_API_KEY=...
PHOENIX_COLLECTOR_ENDPOINT=...
```

---

## Key Innovation

> **AI Interviewer, Not a Linter.**
> Ignores typos. Interrupts on logic flaws. Encourages good approaches.

| Behavior | Linter | Code Proctor |
|----------|--------|--------------|
| Typo | ❌ Flag | ✅ Ignore |
| Logic flaw | ❌ Can't detect | ✅ Interrupt |
| Good approach | ❌ No feedback | ✅ Encourage |

---

## Out of Scope (24hr)

- Authentication, production scaling, email notifications
- Multiple languages (Python only), video recording, mobile

---

*NexHacks 2026 — Build fast, ship faster.* 🚀