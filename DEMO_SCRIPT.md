# ARETE - 5 Minute Demo Script (Team Split)

**Team:**
*   **Emmett** (Intro/Business/Impact) - The Hook
*   **Ayush** (Live Demo/Backend) - The "Build"
*   **Rohan** (Observability/Architecture) - The "Tech Details"

---

## 0:00 - 0:45 | The Hook: The Billion Dollar Inefficiency
**Speaker: Emmett**

"Hi, we're Team ARETE. Companies today spend **$200 and an hour of senior engineering time** for *every single* technical interview. For a big tech company, that's tens of millions of dollars a year spent on a process that is often biased, inconsistent, and drags engineers away from building products.

We built **ARETE**. It replaces that $200 human interview with a **$1 AI interview** that is fairer, faster, and infinitely scalable.

And we're not just pitching deckware. Ayush is going to show you it working live."

---

## 0:45 - 3:00 | The "Build" (Live Demo)
**Speaker: Ayush**
*(Driving the Laptop)*

**1. The "Magic" Latency Moment**
"Thanks Emmett. First, I want you to notice the speed. We're using **Llama 3.3 70B on Groq** combined with **Deepgram** and **ElevenLabs**. The result is sub-second latency, which is critical for a natural interview."

*(Action: Speak to the AI)*
*   **Ayush:** "Hi, I'm ready to start the interview."
*   **AI:** "Great. Let's jump right in. Today we're working on the Two Sum problem..."

**2. Real-Time Code Intelligence**
"This isn't just a chatbot. It's watching my keystrokes in this Monaco editor — which Rohan built — in real-time."

*(Action: Start typing a solution for Two Sum. Intentionally write a nested loop `O(n^2)` solution.)*
*   **Ayush (Narrating):** "I'm going to write a brute force solution. Watch how it handles logical errors, not just syntax."
*   **Ayush (Typing):** `for i in range(n): for j in range(n):`
*   *(Pause slightly)*
*   **AI (Interrupts):** "I see you're starting with a nested loop. That works, but it's O(n^2). Can you think of a data structure that would let us do this in one pass?"

"It interrupted me **in context**. It understands the *logic* of the code I'm writing, live."

*(Action: Change to Hash Map solution)*
*   **Ayush:** "Oh, right, I can use a dictionary."
*   **AI:** "Exactly. That will bring us down to linear time."
*   *(Click Run Code)*
*   **AI:** "Tests passed. Great job."

---

## 3:00 - 4:00 | The Fairness Dashboard
**Speaker: Rohan**
*(Ayush navigates while Rohan speaks)*

"We didn't just build a frontend wrapper. We built a sophisticated multi-agent system on the backend.

While Ayush was interviewing, a second **Fairness Monitor Agent** (powered by Gemini 3.0 Pro) was analyzing the transcript in parallel."

*(Show Dashboard)*
"This dashboard I designed gives recruiters a normalized view of the interaction. You can see the code replay synced with the audio, the full transcript, and most importantly, a **Fairness Score** and **Bias Report**.

This solves the 'black box' problem of AI hiring. If the AI had been rude, or if the candidate had severe accent difficulties it didn't understand, this agent would flag it for human review. We aren't just automating interviews; we're automating the *auditing* of interviews."

---

## 4:00 - 5:00 | The Business Case & Closing
**Speaker: Emmett**

"To recap, we are targeting the **Startup Potential** criteria.

1.  **Innovation:** We combined Groq's low-latency inference with real-time AST parsing to create an experience that feels human.
2.  **Scalability:** We can run 10,000 concurrent interviews today. No scheduling headaches.
3.  **Impact:** We reduce the cost of hiring by **99%**.

We aren't just building a hackathon project; we're building the infrastructure that will hire the next generation of engineers. We are ARETE. Thank you."

---

## Q&A Roles
*   **Ayush:** Answer technical questions about the Agents, LLMs (Groq/Llama), and Backend.
*   **Rohan:** Answer questions about the User Experience, Frontend, or Dashboard.
*   **Emmett:** Answer questions about the Business Model, Market Size, and Cost Savings.
