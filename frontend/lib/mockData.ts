// Mock data for ARETE dashboard - Google Technical Interview Style

export interface InterviewResult {
  interview_id: string
  candidate_name: string
  role: string
  level: string
  problem: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  duration_minutes: number
  timestamp: string

  // Google's 4 technical scoring categories (1-4 scale)
  scores: {
    coding: number          // Implementation quality, syntax, language fluency
    algorithms: number      // Optimal solution selection, complexity analysis
    problem_solving: number // Approach structure, trade-off analysis
    communication: number   // Explaining thought process clearly
    overall: number
  }

  recommendation: 'Strong Hire' | 'Hire' | 'Lean Hire' | 'Lean No Hire' | 'No Hire' | 'Strong No Hire'
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

  timeline: {
    timestamp: string
    event: string
    type: 'start' | 'progress' | 'hint' | 'submission' | 'end'
  }[]

  percentile: number

  hiring_committee: {
    vote: 'Hire' | 'No Hire'
    level_recommendation: string
    notes: string
  }
}

export const mockInterviewResult: InterviewResult = {
  interview_id: 'abc123',
  candidate_name: 'Alex Chen',
  role: 'Software Engineer',
  level: 'L4',
  problem: 'Two Sum',
  difficulty: 'Easy',
  duration_minutes: 23,
  timestamp: '2026-01-17T14:30:00Z',

  scores: {
    coding: 3.5,
    algorithms: 3.0,
    problem_solving: 3.5,
    communication: 3.5,
    overall: 3.4
  },

  recommendation: 'Hire',
  confidence: 0.87,

  fairness: {
    bias_detected: false,
    fairness_score: 9.2,
    hint_frequency: 'Within normal range (2 hints)',
    question_difficulty: 'Appropriate for L4 level',
    flags: []
  },

  interviewer_notes: 'Candidate demonstrated solid coding fundamentals and clear communication throughout. Initially approached with brute-force O(n²) solution, then optimized to O(n) with hash map after brief discussion. Shows strong potential for L4 role.',
  code_submissions: 3,
  hints_given: 2,

  summary: {
    strengths: [
      'Clear articulation of thought process',
      'Quick to iterate after feedback',
      'Strong grasp of time/space complexity tradeoffs',
      'Clean, readable implementation'
    ],
    improvements: [
      'Consider optimal approach before coding',
      'More thorough edge case analysis upfront'
    ],
    notable: 'Demonstrated excellent learning agility—recovered well from initial suboptimal approach.',
    paragraph: 'Alex demonstrated strong software engineering fundamentals throughout this technical screen. They approached the Two Sum problem methodically, initially implementing a brute-force nested loop solution before optimizing to an O(n) hash map approach when prompted to consider time complexity. Their communication was excellent—they consistently verbalized their thought process, asked clarifying questions, and explained tradeoffs between approaches. The final solution was clean, well-documented, and handled edge cases appropriately. While they needed a hint to reach the optimal solution, their ability to quickly understand and implement feedback demonstrates strong technical adaptability. Based on this performance, Alex shows the technical depth expected at the L4 level.'
  },

  test_cases: {
    passed: 12,
    total: 12
  },

  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    optimal_time: 'O(n)',
    optimal_space: 'O(n)'
  },

  timeline: [
    { timestamp: '00:00', event: 'Interview started, problem presented', type: 'start' },
    { timestamp: '02:15', event: 'Clarifying questions about edge cases', type: 'progress' },
    { timestamp: '05:30', event: 'First submission: O(n²) brute force', type: 'submission' },
    { timestamp: '08:45', event: 'Hint: Consider O(1) lookup structures', type: 'hint' },
    { timestamp: '12:00', event: 'Pivoted to hash map approach', type: 'progress' },
    { timestamp: '15:30', event: 'Second submission: minor index bug', type: 'submission' },
    { timestamp: '18:00', event: 'Hint: Check return format', type: 'hint' },
    { timestamp: '20:45', event: 'Final submission: all tests passing', type: 'submission' },
    { timestamp: '23:00', event: 'Complexity discussion and wrap-up', type: 'end' }
  ],

  percentile: 78,

  hiring_committee: {
    vote: 'Hire',
    level_recommendation: 'L4 Software Engineer',
    notes: 'Solid technical fundamentals with room for growth. Recommend hire at L4.'
  }
}

export const mockInterviewResults: InterviewResult[] = [
  mockInterviewResult,
  {
    interview_id: 'def456',
    candidate_name: 'Jordan Smith',
    role: 'Senior Software Engineer',
    level: 'L5',
    problem: 'Merge Intervals',
    difficulty: 'Medium',
    duration_minutes: 31,
    timestamp: '2026-01-17T15:45:00Z',

    scores: {
      coding: 4.0,
      algorithms: 4.0,
      problem_solving: 4.0,
      communication: 3.5,
      overall: 3.9
    },

    recommendation: 'Strong Hire',
    confidence: 0.94,

    fairness: {
      bias_detected: false,
      fairness_score: 9.8,
      hint_frequency: 'Excellent (0 hints needed)',
      question_difficulty: 'Appropriate for L5 level',
      flags: []
    },

    interviewer_notes: 'Exceptional performance. Immediately identified sorting as key insight, implemented clean O(n log n) solution, and proactively discussed edge cases. Strong L5 candidate.',
    code_submissions: 2,
    hints_given: 0,

    summary: {
      strengths: [
        'Immediately identified optimal approach',
        'Proactive edge case handling',
        'Clean, efficient implementation',
        'Strong algorithmic intuition'
      ],
      improvements: [
        'Could elaborate more on alternative approaches'
      ],
      notable: 'Top-tier performance. Solved medium difficulty problem independently with optimal solution.',
      paragraph: 'Jordan delivered an exceptional performance on the Merge Intervals problem, demonstrating senior-level engineering skills throughout. From the outset, they correctly identified that sorting by start time would be the key insight, and immediately began implementing an O(n log n) solution. Their code was remarkably clean, with descriptive variable names and clear logic flow. When asked about edge cases, Jordan proactively mentioned empty arrays, single intervals, and fully overlapping intervals—demonstrating thorough preparation and attention to detail. This candidate shows the technical excellence and independent problem-solving expected at the L5 level.'
    },

    test_cases: {
      passed: 15,
      total: 15
    },

    complexity: {
      time: 'O(n log n)',
      space: 'O(n)',
      optimal_time: 'O(n log n)',
      optimal_space: 'O(n)'
    },

    timeline: [
      { timestamp: '00:00', event: 'Interview started, problem presented', type: 'start' },
      { timestamp: '01:30', event: 'Identified sorting as key insight', type: 'progress' },
      { timestamp: '04:00', event: 'Began coding optimal solution', type: 'progress' },
      { timestamp: '12:00', event: 'First submission: all tests passing', type: 'submission' },
      { timestamp: '18:00', event: 'Discussed edge cases and optimizations', type: 'progress' },
      { timestamp: '25:00', event: 'Final submission with minor refactor', type: 'submission' },
      { timestamp: '31:00', event: 'Complexity analysis and follow-ups', type: 'end' }
    ],

    percentile: 95,

    hiring_committee: {
      vote: 'Hire',
      level_recommendation: 'L5 Senior Software Engineer',
      notes: 'Exceptional technical performance. Strong hire at L5.'
    }
  }
]
