// API client for ARETE backend communication

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

// Types
export interface StartInterviewRequest {
  candidate_name: string
  problem_id?: string
}

export interface StartInterviewResponse {
  session_id: string
  problem: {
    id: string
    title: string
    description: string
    difficulty: string
    examples: Array<{
      input: string
      output: string
      explanation?: string
    }>
    constraints: string[]
    starter_code: string
    test_cases: Array<{
      input: string
      expected: string
      is_hidden: boolean
    }>
  }
  livekit_token?: string
}

export interface CodeSnapshotRequest {
  code: string
  cursor_position?: { line: number; column: number }
}

export interface RunCodeRequest {
  code: string
}

export interface RunCodeResponse {
  results: Array<{
    case: number
    passed: boolean
    input: string
    expected: string
    actual?: string
    error?: string
  }>
  all_passed: boolean
  execution_time_ms: number
}

export interface SubmitSolutionRequest {
  code: string
  final_answer?: string
}

export interface SubmitSolutionResponse {
  success: boolean
  redirect_url: string
}

export interface InterviewReport {
  interview_id: string
  candidate_name: string
  role: string
  level: string
  problem: string
  difficulty: string
  duration_minutes: number
  timestamp: string
  scores: {
    coding: number
    algorithms: number
    problem_solving: number
    communication: number
    overall: number
  }
  recommendation: string
  confidence: number
  fairness: {
    bias_detected: boolean
    fairness_score: number
    hint_frequency: string
    question_difficulty: string
    flags: string[]
  }
  interviewer_notes: string
  code_submissions: number
  hints_given: number
  summary: {
    strengths: string[]
    improvements: string[]
    notable: string
    paragraph: string
  }
  test_cases: {
    passed: number
    total: number
  }
  complexity: {
    time: string
    space: string
    optimal_time: string
    optimal_space: string
  }
  timeline: Array<{
    timestamp: string
    event: string
    type: string
  }>
  percentile: number
  hiring_committee: {
    vote: string
    level_recommendation: string
    notes: string
  }
}

// WebSocket message types
export type WSMessageType =
  | 'ai_message'
  | 'hint'
  | 'code_feedback'
  | 'interview_status'
  | 'error'

export interface WSMessage {
  type: WSMessageType
  data: any
  timestamp: string
}

// Helper to fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 5000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// API Client class
class APIClient {
  private baseUrl: string
  private wsBaseUrl: string
  private timeout: number

  constructor() {
    this.baseUrl = API_BASE_URL
    this.wsBaseUrl = WS_BASE_URL
    this.timeout = 2000 // 2 second timeout for API calls (fast fail for tests)
  }

  // Start a new interview session
  async startInterview(request: StartInterviewRequest): Promise<StartInterviewResponse> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/interviews`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      },
      this.timeout
    )

    if (!response.ok) {
      throw new Error(`Failed to start interview: ${response.statusText}`)
    }

    return response.json()
  }

  // Send code snapshot for real-time analysis
  async sendCodeSnapshot(sessionId: string, request: CodeSnapshotRequest): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/interviews/${sessionId}/code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      console.error('Failed to send code snapshot:', response.statusText)
    }
  }

  // Run code and get test results
  async runCode(sessionId: string, request: RunCodeRequest): Promise<RunCodeResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/interviews/${sessionId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Failed to run code: ${response.statusText}`)
    }

    return response.json()
  }

  // Submit final solution
  async submitSolution(sessionId: string, request: SubmitSolutionRequest): Promise<SubmitSolutionResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/interviews/${sessionId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Failed to submit solution: ${response.statusText}`)
    }

    return response.json()
  }

  // Get interview report/results
  async getReport(sessionId: string): Promise<InterviewReport> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/interviews/${sessionId}/report`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      this.timeout
    )

    if (!response.ok) {
      throw new Error(`Failed to get report: ${response.statusText}`)
    }

    return response.json()
  }

  // Get LiveKit token for video/audio
  async getLiveKitToken(sessionId: string, participantName: string): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/interviews/${sessionId}/token?participant_name=${encodeURIComponent(participantName)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to get LiveKit token: ${response.statusText}`)
    }

    const data = await response.json()
    return data.token
  }

  // Get available problems
  async getProblems(): Promise<Array<{ id: string; title: string; difficulty: string }>> {
    const response = await fetch(`${this.baseUrl}/api/v1/problems`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get problems: ${response.statusText}`)
    }

    return response.json()
  }

  // Create WebSocket connection
  createWebSocket(sessionId: string): WebSocket {
    const ws = new WebSocket(`${this.wsBaseUrl}/ws/${sessionId}`)
    return ws
  }
}

// Export singleton instance
export const apiClient = new APIClient()

// WebSocket hook helper
export function createInterviewWebSocket(
  sessionId: string,
  onMessage: (message: WSMessage) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = apiClient.createWebSocket(sessionId)

  ws.onopen = () => {
    console.log('WebSocket connected')
  }

  ws.onmessage = (event) => {
    try {
      const message: WSMessage = JSON.parse(event.data)
      onMessage(message)
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e)
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    onError?.(error)
  }

  ws.onclose = () => {
    console.log('WebSocket closed')
    onClose?.()
  }

  return ws
}

// Helper to send code snapshots via WebSocket
export function sendCodeViaWebSocket(ws: WebSocket, code: string, cursorPosition?: { line: number; column: number }) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'code_snapshot',
      data: {
        code,
        cursor_position: cursorPosition,
        timestamp: new Date().toISOString(),
      },
    }))
  }
}
