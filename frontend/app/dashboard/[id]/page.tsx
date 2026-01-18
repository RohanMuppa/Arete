'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient, type InterviewReport } from '@/lib/api'

export default function DashboardPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<InterviewReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const report = await apiClient.getReport(params.id)
        setData(report)
      } catch (err) {
        console.error('Failed to benefit report:', err)
        setError('Failed to load interview report. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchReport()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Loading report...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-display text-[var(--text-primary)]">Error</h3>
          <p className="text-[var(--text-secondary)]">{error || 'Report not found'}</p>
          <Link href="/" className="btn btn-primary px-4 py-2 mt-4 inline-block">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  const getRecommendationColor = (rec: string) => {
    if (rec.includes('Strong Hire')) return 'text-[var(--accent-emerald)]'
    if (rec.includes('Hire')) return 'text-[var(--accent-emerald)]'
    if (rec.includes('Lean Hire')) return 'text-[var(--accent-amber)]'
    return 'text-[var(--accent-rose)]'
  }

  const getScoreColor = (score: number) => {
    if (score >= 3.5) return 'text-[var(--accent-emerald)]'
    if (score >= 2.5) return 'text-[var(--text-primary)]'
    return 'text-[var(--accent-rose)]'
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <Link href="/" className="font-display text-xl">
              Areté
            </Link>
            <Link href="/" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Exit
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Candidate Header */}
        <div className="mb-12">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-4xl mb-2">{data.candidate_name}</h1>
              <p className="text-lg text-[var(--text-secondary)]">
                {data.role} · {data.level}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-[var(--text-tertiary)]">{data.problem}</div>
              <div className="text-sm text-[var(--text-tertiary)]">{data.difficulty} · {data.duration_minutes} min</div>
            </div>
          </div>
        </div>

        {/* Decision Card */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-8 mb-12">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                Recommendation
              </div>
              <div className={`font-display text-3xl ${getRecommendationColor(data.recommendation)}`}>
                {data.recommendation}
              </div>
            </div>
            <div>
              <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                Confidence
              </div>
              <div className="font-mono text-3xl">
                {(data.confidence * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                Level
              </div>
              <div className="font-display text-3xl">
                {data.level}
              </div>
            </div>
          </div>
        </div>

        {/* Scores - Google's 4 Technical Categories */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Technical Scores</h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
            <div className="grid grid-cols-2 gap-6">
              {[
                { label: 'Coding', score: data.scores.coding, desc: 'Implementation quality, syntax, fluency' },
                { label: 'Algorithms', score: data.scores.algorithms, desc: 'Optimal solution, complexity analysis' },
                { label: 'Problem Solving', score: data.scores.problem_solving, desc: 'Approach structure, trade-offs' },
                { label: 'Communication', score: data.scores.communication, desc: 'Explaining thought process' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-4 border-b border-[var(--border)]">
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">{item.label}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{item.desc}</div>
                  </div>
                  <div className={`font-mono text-2xl font-medium ${getScoreColor(item.score)}`}>
                    {item.score.toFixed(1)}<span className="text-sm text-[var(--text-tertiary)]">/4</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-[var(--border)] flex items-center justify-between">
              <span className="font-display text-lg">Overall Score</span>
              <span className={`font-mono text-3xl font-bold ${getScoreColor(data.scores.overall)}`}>
                {data.scores.overall.toFixed(1)}<span className="text-base text-[var(--text-tertiary)]">/4</span>
              </span>
            </div>
          </div>
        </section>

        {/* Interviewer Feedback */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Interviewer Feedback</h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
            <p className="text-[var(--text-primary)] leading-relaxed">
              {data.summary.paragraph}
            </p>
          </div>
        </section>

        {/* Technical Results */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Technical Results</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5">
              <div className="text-sm text-[var(--text-tertiary)] mb-1">Test Cases</div>
              <div className="font-mono text-2xl text-[var(--accent-emerald)]">
                {data.test_cases.passed}/{data.test_cases.total}
              </div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5">
              <div className="text-sm text-[var(--text-tertiary)] mb-1">Time Complexity</div>
              <div className="font-mono text-2xl">{data.complexity.time}</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5">
              <div className="text-sm text-[var(--text-tertiary)] mb-1">Percentile</div>
              <div className="font-mono text-2xl">{data.percentile}th</div>
            </div>
          </div>
        </section>

        {/* Key Insights */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Key Insights</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
              <div className="text-[var(--accent-emerald)] font-medium mb-4">Strengths</div>
              <ul className="space-y-3">
                {data.summary.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[var(--accent-emerald)]">+</span>
                    <span className="text-[var(--text-secondary)]">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
              <div className="text-[var(--text-tertiary)] font-medium mb-4">Areas for Growth</div>
              <ul className="space-y-3">
                {data.summary.improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[var(--text-tertiary)]">→</span>
                    <span className="text-[var(--text-secondary)]">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Interview Timeline */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Interview Timeline</h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
            <div className="space-y-3">
              {data.timeline.map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="font-mono text-sm text-[var(--text-tertiary)] w-12">{item.timestamp}</span>
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${item.type === 'hint' ? 'bg-[var(--accent-amber)]' :
                    item.type === 'submission' ? 'bg-[var(--accent-primary)]' :
                      item.type === 'start' || item.type === 'end' ? 'bg-[var(--accent-emerald)]' :
                        'bg-[var(--text-muted)]'
                    }`} />
                  <span className="text-[var(--text-secondary)]">{item.event}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Hiring Committee */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Hiring Committee</h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className={`px-4 py-2 rounded-lg font-medium ${data.hiring_committee.vote === 'Hire'
                ? 'bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]'
                : 'bg-[var(--accent-rose)]/10 text-[var(--accent-rose)]'
                }`}>
                {data.hiring_committee.vote}
              </div>
              <span className="text-[var(--text-secondary)]">→</span>
              <span className="font-medium">{data.hiring_committee.level_recommendation}</span>
            </div>
            <p className="text-[var(--text-secondary)]">{data.hiring_committee.notes}</p>
          </div>
        </section>

        {/* Fairness Audit */}
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Fairness Audit</h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-emerald)] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="font-medium">No Bias Detected</div>
                <div className="text-sm text-[var(--text-tertiary)]">Fairness Score: {data.fairness.fairness_score}/10</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--text-tertiary)]">Hint Frequency:</span>
                <span className="ml-2 text-[var(--text-secondary)]">{data.fairness.hint_frequency}</span>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)]">Question Difficulty:</span>
                <span className="ml-2 text-[var(--text-secondary)]">{data.fairness.question_difficulty}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between pt-8 border-t border-[var(--border)]">
          <Link href="/" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← Back
          </Link>
          <div className="flex gap-3">
            <button className="btn btn-secondary">
              Export PDF
            </button>
            <Link href="/interview/two-sum" className="btn btn-primary">
              New Interview
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
