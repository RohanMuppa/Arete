'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LiveKitRoom from '@/components/interview/LiveKitRoom'
import CodeEditor from '@/components/interview/CodeEditor'
import {
  apiClient,
  createInterviewWebSocket,
  sendCodeViaWebSocket,
  type WSMessage,
  type StartInterviewResponse
} from '@/lib/api'

// Fallback problem when backend isn't available
const FALLBACK_PROBLEM = {
  id: 'two-sum',
  title: 'Two Sum',
  difficulty: 'Easy',
  description: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
  examples: [
    {
      input: 'nums = [2,7,11,15], target = 9',
      output: '[0,1]',
      explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
    },
    {
      input: 'nums = [3,2,4], target = 6',
      output: '[1,2]'
    }
  ],
  constraints: [
    '2 ≤ nums.length ≤ 10⁴',
    '-10⁹ ≤ nums[i] ≤ 10⁹',
    '-10⁹ ≤ target ≤ 10⁹',
    'Only one valid answer exists.'
  ],
  starter_code: `def twoSum(nums: list[int], target: int) -> list[int]:
    """
    Given an array of integers nums and an integer target,
    return indices of the two numbers that add up to target.
    """
    # Write your solution here
    pass
`
}


export default function InterviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [timer, setTimer] = useState(0)
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'candidate', text: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'problem' | 'transcript'>('problem')

  // Pre-interview setup state
  const [showSetup, setShowSetup] = useState(true)
  const [candidateName, setCandidateName] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  // API state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [problem, setProblem] = useState(FALLBACK_PROBLEM)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [currentCode, setCurrentCode] = useState(FALLBACK_PROBLEM.starter_code)

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null)

  // NOTE: Browser TTS removed - when LiveKit agent is active, TTS comes from the agent
  // The agent publishes audio directly through LiveKit, received via AudioTrack in LiveKitRoom

  // Memoized callbacks for LiveKitRoom to prevent re-renders
  const handleLiveKitConnect = useCallback(() => {
    console.log('LiveKit connected')
  }, [])

  const handleLiveKitMessage = useCallback((text: string) => {
    console.log('📝 handleLiveKitMessage received:', JSON.stringify(text))

    // Check if message is from user - look for "You:" prefix (case-insensitive)
    const isUserMessage = text.toLowerCase().startsWith('you:')

    console.log('📝 Is user message:', isUserMessage)

    if (isUserMessage) {
      // Remove the "You:" prefix and trim
      const cleanText = text.substring(4).trim()
      console.log('📝 Adding as USER message:', cleanText)
      setMessages(prev => [...prev, { role: 'candidate', text: cleanText }])
    } else {
      console.log('📝 Adding as AI message:', text)
      setMessages(prev => [...prev, { role: 'ai', text }])
    }

    // Auto-scroll transcript
    setTimeout(() => {
      document.getElementById('transcript-end')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }, [])


  // Handle WebSocket messages from AI
  // NOTE: TTS comes from LiveKit agent, not browser - just update transcript
  const handleWSMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'ai_message':
        setMessages(prev => [...prev, { role: 'ai', text: message.data.text }])
        // TTS handled by LiveKit agent, not browser
        break
      case 'hint':
        setMessages(prev => [...prev, { role: 'ai', text: message.data.text }])
        // TTS handled by LiveKit agent, not browser
        setHintsUsed(prev => prev + 1)
        break
      case 'code_feedback':
        // Optional: show inline feedback
        console.log('Code feedback:', message.data)
        break
      case 'interview_status':
        if (message.data.status === 'completed') {
          router.push(`/dashboard/${sessionId}`)
        }
        break
      case 'error':
        console.error('Interview error:', message.data)
        break
    }
  }, [sessionId, router])

  // Start interview session
  const startInterview = useCallback(async () => {
    if (!candidateName.trim()) return

    setIsStarting(true)
    setIsLoading(true)

    try {
      // Try to start a real interview session
      const response = await apiClient.startInterview({
        candidate_name: candidateName.trim(),
        problem_id: params.id === 'demo' ? 'two_sum' : params.id,
      })

      setSessionId(response.session_id)
      // Backend returns flat fields, use them with fallback problem for missing fields
      setProblem({
        id: params.id === 'demo' ? 'two_sum' : params.id,
        title: (response as any).problem_title || FALLBACK_PROBLEM.title,
        difficulty: FALLBACK_PROBLEM.difficulty,
        description: FALLBACK_PROBLEM.description,
        examples: FALLBACK_PROBLEM.examples,
        constraints: FALLBACK_PROBLEM.constraints,
        starter_code: (response as any).starter_code || FALLBACK_PROBLEM.starter_code,
      })
      setCurrentCode((response as any).starter_code || FALLBACK_PROBLEM.starter_code)
      setIsConnected(true)
      setShowSetup(false)  // Transition to interview view
      setIsLoading(false)

      // Connect WebSocket for real-time communication
      const ws = createInterviewWebSocket(
        response.session_id,
        handleWSMessage,
        () => console.error('WebSocket error'),
        () => setIsConnected(false)
      )
      wsRef.current = ws

    } catch (error) {
      console.error('Failed to start interview:', error)
      setIsLoading(false)
      setIsStarting(false)
      // Show error to user - NO FALLBACK MODE
      alert('Failed to connect to interview backend. Please check that the backend is running.')
    }
  }, [candidateName, params.id, handleWSMessage])

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  // Timer - only run when interview has started
  useEffect(() => {
    if (showSetup || isLoading) return

    const interval = setInterval(() => {
      setTimer(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [showSetup, isLoading])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Handle code changes - send snapshots via WebSocket
  const handleCodeChange = useCallback((code: string) => {
    setCurrentCode(code)

    // Send code snapshot via WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendCodeViaWebSocket(wsRef.current, code)
    }
  }, [])

  // Handle running code
  const handleRunCode = useCallback(async (code: string) => {
    if (!sessionId || !isConnected) {
      // No backend connection - cannot run code
      throw new Error('Backend not connected. Cannot execute code.')
    }

    try {
      const result = await apiClient.runCode(sessionId, { code })
      return result
    } catch (error) {
      console.error('Failed to run code:', error)
      throw error
    }
  }, [sessionId, isConnected])

  // Handle final submission
  const handleSubmit = async () => {
    if (!sessionId || !isConnected) {
      alert('Backend not connected. Cannot submit solution.')
      return
    }

    setIsSubmitting(true)
    setMessages(prev => [...prev, { role: 'ai', text: "Great work! Let me review your solution..." }])

    try {
      const result = await apiClient.submitSolution(sessionId, {
        code: currentCode,
      })
      // Redirect to dashboard
      setTimeout(() => {
        router.push(result.redirect_url || `/dashboard/${sessionId}`)
      }, 2000)
    } catch (error) {
      console.error('Failed to submit:', error)
      setIsSubmitting(false)
      alert('Failed to submit solution. Please try again.')
    }
  }

  // Pre-interview setup screen
  if (showSetup) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)] bg-noise">
        <div className="bg-gradient-radial absolute inset-0 pointer-events-none" />
        <div className="relative w-full max-w-md mx-4">
          <div className="card card-glass p-8 border-gradient">
            <div className="text-center mb-8">
              <h1 className="font-display text-4xl mb-2">Areté</h1>
              <p className="text-[var(--text-secondary)]">Technical Interview</p>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Your Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startInterview()}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  autoFocus
                  suppressHydrationWarning
                />
              </div>

              <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center text-white font-display">
                    S
                  </div>
                  <div>
                    <div className="font-medium">Sarah</div>
                    <div className="text-sm text-[var(--text-tertiary)]">AI Interviewer</div>
                  </div>
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  You will solve <span className="font-medium">{FALLBACK_PROBLEM.title}</span> ({FALLBACK_PROBLEM.difficulty}) in a simulated Google-style technical interview.
                </div>
              </div>

              <button
                onClick={startInterview}
                disabled={!candidateName.trim() || isStarting}
                className="btn btn-primary w-full py-4"
              >
                {isStarting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Start Interview'
                )}
              </button>

              <Link href="/" className="block text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading state (transitioning to interview)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Preparing your interview...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-lg">
              Areté
            </Link>
            <div className="h-4 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-2">
              <span className="font-display text-[var(--text-primary)]">{problem.title}</span>
              <span className="badge badge-success text-xs">{problem.difficulty}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="badge badge-info">LIVE</span>
            <div className="font-mono text-lg font-semibold">
              {formatTime(timer)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - New Zoom-style layout */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Top: Video Section - Side by side like Zoom */}
        <div className="flex-shrink-0 h-[450px] bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
          <div className="h-full w-full">
            <LiveKitRoom
              sessionId={sessionId || params.id}
              candidateName={candidateName}
              onConnect={handleLiveKitConnect}
              onMessage={handleLiveKitMessage}
              layout="side-by-side"
            />
          </div>
        </div>

        {/* Bottom: Problem/Transcript + Code Editor */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-[350px_1fr] overflow-hidden">
          {/* Left Panel - Problem & Transcript (isolated scroll) */}
          <div className="flex flex-col min-h-0 overflow-hidden bg-[var(--bg-secondary)] border-r border-[var(--border)]">
            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab('problem')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'problem'
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
              >
                Problem
              </button>
              <button
                onClick={() => setActiveTab('transcript')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'transcript'
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
              >
                Transcript
                {messages.length > 0 && (
                  <span className="ml-2 text-xs bg-[var(--accent-primary)] text-white px-1.5 py-0.5 rounded-full">
                    {messages.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-h-0 overflow-hidden p-4">
              {activeTab === 'problem' ? (
                <div className="space-y-6 h-full overflow-y-auto pr-2 scrollbar-thin">
                  {/* Description */}
                  <div>
                    <p className="text-[var(--text-secondary)] whitespace-pre-line leading-relaxed text-sm">
                      {problem.description}
                    </p>
                  </div>

                  {/* Examples */}
                  <div>
                    <h4 className="font-display text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                      Examples
                    </h4>
                    <div className="space-y-2">
                      {problem.examples.map((ex, i) => (
                        <div key={i} className="bg-[var(--bg-tertiary)] rounded-lg p-2 font-mono text-xs">
                          <div className="text-[var(--text-tertiary)]">Input: <span className="text-[var(--text-primary)]">{ex.input}</span></div>
                          <div className="text-[var(--text-tertiary)]">Output: <span className="text-[var(--text-primary)]">{ex.output}</span></div>
                          {ex.explanation && (
                            <div className="text-[var(--text-tertiary)] mt-1 text-xs">{ex.explanation}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Constraints */}
                  <div>
                    <h4 className="font-display text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                      Constraints
                    </h4>
                    <ul className="space-y-1">
                      {problem.constraints.map((c, i) => (
                        <li key={i} className="text-xs text-[var(--text-secondary)] font-mono">
                          • {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 h-full overflow-y-auto pr-2 scrollbar-thin">
                  {messages.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                      Conversation will appear here...
                    </p>
                  ) : (
                    messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`animate-fade-in p-3 rounded-lg ${msg.role === 'ai'
                          ? 'bg-[var(--accent-primary)]/10 border-l-2 border-[var(--accent-primary)]'
                          : 'bg-[var(--accent-emerald)]/10 border-l-2 border-[var(--accent-emerald)]'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${msg.role === 'ai'
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'bg-[var(--accent-emerald)] text-white'
                            }`}>
                            {msg.role === 'ai' ? 'AI' : 'ME'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-semibold mb-1 ${msg.role === 'ai' ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-emerald)]'
                              }`}>
                              {msg.role === 'ai' ? 'Sarah (AI)' : 'You'}
                            </div>
                            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                              {msg.text}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div id="transcript-end" />
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Code Editor (isolated scroll) */}
          <div className="min-h-0 flex flex-col overflow-hidden">
            <CodeEditor
              initialCode={problem.starter_code}
              onCodeChange={handleCodeChange}
              onRunCode={handleRunCode}
            />
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-tertiary)]">Status:</span>
              <span className="text-[var(--accent-emerald)] font-medium">
                Recording
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-tertiary)]">Hints:</span>
              <span className="font-mono">{hintsUsed} / 3</span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn btn-primary px-6"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Solution'}
          </button>
        </div>
      </div>
    </div>
  )
}
