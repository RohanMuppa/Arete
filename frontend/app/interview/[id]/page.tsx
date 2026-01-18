'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LiveKitRoom from '@/components/interview/LiveKitRoom'
import CodeEditor from '@/components/interview/CodeEditor'

const PROBLEM = {
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
  ]
}

const AI_MESSAGES = [
  { delay: 0, text: "Hi! I'm Sarah, your interviewer today. Let's work through Two Sum together." },
  { delay: 8000, text: "Take your time to think through the problem. Feel free to think out loud." },
  { delay: 25000, text: "I see you're working on a solution. What's your approach?" },
  { delay: 45000, text: "Good progress! Consider the time complexity of your current approach." },
  { delay: 70000, text: "Have you thought about using a hash map for O(1) lookups?" },
]

export default function InterviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [timer, setTimer] = useState(0)
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'candidate', text: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'problem' | 'transcript'>('problem')

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Simulated AI messages
  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = []

    AI_MESSAGES.forEach((msg, index) => {
      const timeout = setTimeout(() => {
        setMessages(prev => [...prev, { role: 'ai', text: msg.text }])
      }, msg.delay)
      timeouts.push(timeout)
    })

    return () => timeouts.forEach(clearTimeout)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const handleSubmit = () => {
    setIsSubmitting(true)
    setMessages(prev => [...prev, { role: 'ai', text: "Great work! Let me review your solution..." }])

    setTimeout(() => {
      router.push(`/dashboard/${params.id}`)
    }, 2000)
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
              <span className="font-display text-[var(--text-primary)]">{PROBLEM.title}</span>
              <span className="badge badge-success text-xs">{PROBLEM.difficulty}</span>
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

      {/* Main Content */}
      <div className="flex-1 overflow-hidden grid lg:grid-cols-[380px_1fr]">
        {/* Left Panel - AI & Info */}
        <div className="flex flex-col h-full bg-[var(--bg-secondary)] border-r border-[var(--border)]">
          {/* AI Avatar */}
          <div className="flex-shrink-0 p-4">
            <div className="aspect-square max-h-48">
              <LiveKitRoom roomName={params.id} onConnect={() => {}} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            <button
              onClick={() => setActiveTab('problem')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'problem'
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Problem
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'transcript'
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
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'problem' ? (
              <div className="space-y-6">
                {/* Description */}
                <div>
                  <p className="text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
                    {PROBLEM.description}
                  </p>
                </div>

                {/* Examples */}
                <div>
                  <h4 className="font-display text-sm text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
                    Examples
                  </h4>
                  <div className="space-y-3">
                    {PROBLEM.examples.map((ex, i) => (
                      <div key={i} className="bg-[var(--bg-tertiary)] rounded-lg p-3 font-mono text-sm">
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
                  <h4 className="font-display text-sm text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
                    Constraints
                  </h4>
                  <ul className="space-y-1">
                    {PROBLEM.constraints.map((c, i) => (
                      <li key={i} className="text-sm text-[var(--text-secondary)] font-mono">
                        • {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                    Conversation will appear here...
                  </p>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className="animate-fade-in">
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          msg.role === 'ai'
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                        }`}>
                          {msg.role === 'ai' ? 'S' : 'Y'}
                        </div>
                        <p className="flex-1 text-sm text-[var(--text-secondary)] leading-relaxed pt-1">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Code Editor */}
        <div className="h-full flex flex-col">
          <CodeEditor
            onCodeChange={() => {}}
            onRunCode={() => {}}
          />
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-tertiary)]">Status:</span>
              <span className="text-[var(--accent-emerald)] font-medium">Recording</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-tertiary)]">Hints:</span>
              <span className="font-mono">0 / 3</span>
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
