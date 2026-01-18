# ARETE - AI Technical Interview Platform

> An AI interviewer that conducts LeetCode-style technical interviews via voice call, watches code in real-time, provides live hints, detects hiring bias, and generates comprehensive recruiter reports.

## Inspiration

Technical interviews at scale are painfully expensive and inconsistent. Companies pay $200/hour for senior engineers to conduct repetitive LeetCode-style interviews—time that could be spent building products. Worse, human interviewers introduce unconscious bias, inconsistent question difficulty, and varying scoring standards. We asked: **What if AI could conduct fair, consistent, and cost-effective technical interviews 24/7?**

The spark came from realizing that real-time code analysis combined with conversational AI could create an interview experience that actually *feels* like talking to a human interviewer—one who watches your code, offers hints when you're stuck, and encourages you when you're on the right track.

## What it does

**ARETE** is a multi-agent AI interviewer that:

- **Conducts live voice interviews** using LiveKit's real-time voice infrastructure
- **Presents LeetCode problems** (Two Sum, Merge Intervals, etc.) via natural voice conversation
- **Watches code in real-time** through a Monaco editor, analyzing snapshots every 1.5 seconds
- **Provides intelligent hints** when it detects logical errors (not typos—those it lets you fix)
- **Runs candidate code** in a secure sandbox and evaluates against test cases
- **Scores performance** across correctness, optimization, communication, and problem-solving
- **Detects hiring bias** through a dedicated Fairness Monitor agent that analyzes transcripts
- **Generates recruiter dashboards** with scores, recordings, transcripts, and bias reports

**Cost: ~$1 per interview vs. $200 for a human interviewer — 99% savings.**

## How we built it

### Backend Stack
- **FastAPI** for REST and WebSocket APIs
- **LangGraph** for multi-agent orchestration (Interviewer → Fairness Monitor pipeline)
- **Llama 3.3 70B on Groq** — Powers the Interviewer agent with ultra-low latency inference
- **Gemini 2.0 Flash** — Powers the Fairness Monitor agent for post-interview analysis
- **LiveKit Agents** for real-time WebRTC voice communication
- **ElevenLabs** for natural text-to-speech

### Frontend Stack
- **Next.js 14** + **React 18** for the web interface
- **LiveKit React SDK** for voice call integration
- **Monaco Editor** for the VS Code-style coding environment
- **TailwindCSS** for styling

### The 2-Agent System
1. **Agent 1: Technical Interviewer** — Conducts the live interview, monitors code in real-time, interrupts with hints on logical errors, encourages good approaches, and scores the solution
2. **Agent 2: Fairness Monitor** — Runs post-interview to analyze the transcript for bias, normalize scores against historical data, and flag any issues

## Challenges we ran into

- **Natural conversation flow** — Getting voice responses under 1 second to make conversations feel truly natural required extremely low-latency inference; Groq's Llama 3.3 70B hosting was critical here
- **Code analysis vs. linting** — Teaching the agent to distinguish between typos (ignore) and logical errors (interrupt) without being annoying
- **Fairness quantification** — Defining bias detection heuristics that are both meaningful and not overly sensitive

## Accomplishments that we're proud of

- **Sub-second latency** — Conversations feel natural and responsive, not robotic
- **Real-time code intelligence** — The interviewer genuinely understands code evolving live, not just static analysis
- **Built-in fairness** — Bias detection isn't an afterthought; it's a core agent in the pipeline
- **24-hour shipping** — Two agents orchestrated, voice conversations flowing, code executing—all in one hackathon

## What we learned

- **Multi-agent systems are powerful** — Separating concerns (interviewing vs. fairness auditing) made both agents better at their specific jobs
- **Latency is everything for voice AI** — The difference between 500ms and 2s response time is the difference between natural and awkward
- **Real-time AI is possible** — With proper debouncing, smart prompting, and fast inference (Groq), sub-second responses are achievable

## What's next

- **Live avatar support** — Add realistic lip-synced video avatars for a more immersive interview experience
- **Multi-language support** — Expand beyond Python to JavaScript, Java, C++
- **Resume parsing** — Pre-analyze candidate backgrounds to tailor interview difficulty
- **Behavioral interview mode** — Add a second interview type for soft-skill assessment
- **Company-specific training** — Fine-tune on a company's past interview data and rubrics
- **Enterprise dashboard** — Analytics across thousands of interviews, A/B testing different problem sets
- **Interview practice mode** — Let candidates practice unlimited interviews before the real thing

---

**Built at NexHacks 2026 @ CMU 🚀**
