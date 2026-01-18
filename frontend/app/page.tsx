'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] bg-noise">
      <div className="bg-gradient-radial absolute inset-0 pointer-events-none" />

      {/* Hero */}
      <section className="section relative pt-20">
        <div className="container max-w-5xl">
          <div className={`text-center mb-16 animate-slide-down delay-0 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            {/* Laurel Wreath */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <svg className="w-12 h-12 text-[var(--text-tertiary)]" viewBox="0 0 64 64" fill="none">
                <path d="M28 8c-4 4-6 10-6 16s2 12 6 16c-8-2-14-10-14-16s6-14 14-16z" fill="currentColor"/>
                <path d="M24 14c-3 3-4 8-4 12s1 9 4 12c-6-2-10-8-10-12s4-10 10-12z" fill="currentColor" opacity="0.6"/>
                <path d="M20 20c-2 2-3 5-3 8s1 6 3 8c-4-2-7-5-7-8s3-6 7-8z" fill="currentColor" opacity="0.3"/>
              </svg>
              <h1 className="font-display text-7xl text-[var(--text-primary)]">
                Areté
              </h1>
              <svg className="w-12 h-12 text-[var(--text-tertiary)] scale-x-[-1]" viewBox="0 0 64 64" fill="none">
                <path d="M28 8c-4 4-6 10-6 16s2 12 6 16c-8-2-14-10-14-16s6-14 14-16z" fill="currentColor"/>
                <path d="M24 14c-3 3-4 8-4 12s1 9 4 12c-6-2-10-8-10-12s4-10 10-12z" fill="currentColor" opacity="0.6"/>
                <path d="M20 20c-2 2-3 5-3 8s1 6 3 8c-4-2-7-5-7-8s3-6 7-8z" fill="currentColor" opacity="0.3"/>
              </svg>
            </div>
            <p className="text-lg text-[var(--text-secondary)] font-body italic">
              Excellence in Technical Interviews
            </p>
          </div>

          {/* Cost Comparison */}
          <div className={`card border-gradient card-glass p-12 mb-16 animate-scale-in delay-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-center gap-20 mb-12">
              <div className="text-center">
                <div className="metric-label mb-3">Traditional</div>
                <div className="text-6xl font-mono font-bold text-[var(--text-tertiary)] line-through opacity-50">
                  $200
                </div>
              </div>

              <svg className="w-12 h-12 text-[var(--accent-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>

              <div className="text-center">
                <div className="metric-label mb-3">Areté</div>
                <div className="text-6xl font-mono font-bold text-gradient-primary">
                  $0.40
                </div>
              </div>
            </div>

            <div className="text-center pt-8 border-t border-[var(--border)]">
              <div className="text-5xl font-display mb-2 text-gradient-secondary">
                99% Savings
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className={`flex justify-center gap-4 mb-20 animate-slide-up delay-400 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            <Link href="/interview/demo" className="btn btn-primary px-8 py-4 text-base">
              Interview Demo
            </Link>
            <Link href="/dashboard/abc123" className="btn btn-secondary px-8 py-4 text-base">
              Recruiter Dashboard
            </Link>
          </div>

          {/* Metrics */}
          <div className={`grid grid-cols-3 gap-6 animate-slide-up delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            <div className="metric-card card-hover p-8">
              <div className="metric-value text-gradient-primary mb-3">~25k</div>
              <div className="metric-label">Tokens/Interview</div>
            </div>
            <div className="metric-card card-hover p-8">
              <div className="metric-value text-gradient-secondary mb-3">100%</div>
              <div className="metric-label">Decisions Traced</div>
            </div>
            <div className="metric-card card-hover p-8">
              <div className="metric-value text-[var(--accent-emerald-light)] mb-3">EEOC</div>
              <div className="metric-label">Audit Ready</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section relative">
        <div className="container max-w-6xl">
          <h2 className="font-display text-4xl mb-16 text-center">How It Works</h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                title: 'Live Interview',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )
              },
              {
                num: '02',
                title: 'Real-time Scoring',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                )
              },
              {
                num: '03',
                title: 'Bias Detection',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                )
              }
            ].map((item, idx) => (
              <div key={item.num} className={`card card-glow card-hover p-8 animate-slide-up delay-${idx * 100 + 600}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white">
                    {item.icon}
                  </div>
                  <div className="text-3xl font-mono font-bold text-[var(--text-tertiary)]">
                    {item.num}
                  </div>
                </div>
                <h4 className="text-xl font-display">{item.title}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI */}
      <section className="section relative">
        <div className="container max-w-4xl">
          <h3 className="text-4xl font-display mb-12 text-center">Enterprise ROI</h3>

          <div className="card border-gradient p-12">
            <div className="flex items-center justify-between mb-12 pb-10 border-b border-[var(--border)]">
              <div>
                <div className="metric-label mb-2">Traditional</div>
                <div className="text-3xl font-mono line-through text-[var(--text-tertiary)] opacity-60">
                  $200,000<span className="text-base">/mo</span>
                </div>
              </div>
              <div className="text-right">
                <div className="metric-label mb-2">Areté</div>
                <div className="text-3xl font-mono font-semibold text-gradient-primary">
                  $400<span className="text-base">/mo</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-7xl font-display mb-3 text-gradient-secondary">
                $2.4M
              </div>
              <div className="text-[var(--text-secondary)] font-body text-lg">
                Annual savings
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-12 bg-[var(--bg-secondary)]">
        <div className="container">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="font-display text-xl text-gradient-primary">Areté</span>
            </div>
            <div className="flex gap-3">
              <span className="badge badge-info">LiveKit</span>
              <span className="badge badge-info">Phoenix</span>
              <span className="badge badge-info">NexHacks 2026</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
