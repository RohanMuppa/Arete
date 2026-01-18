'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, Clock, Lightbulb } from 'lucide-react'

interface InterviewControlsProps {
  onSubmit?: () => void
}

export default function InterviewControls({ onSubmit }: InterviewControlsProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [status, setStatus] = useState<'interviewing' | 'processing' | 'complete'>('interviewing')
  const [hintsUsed, setHintsUsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleSubmit = () => {
    setStatus('processing')
    setTimeout(() => {
      setStatus('complete')
      onSubmit?.()
    }, 2000)
  }

  return (
    <div className="border-t border-[var(--clinical-gray-200)] bg-white p-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left: Status & Timer */}
        <div className="flex items-center gap-6">
          {/* Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status === 'interviewing' ? 'bg-[var(--clinical-green)] pulse-clinical' :
              status === 'processing' ? 'bg-[var(--clinical-amber)]' :
              'bg-[var(--clinical-blue)]'
            }`}></div>
            <span className="text-sm font-medium text-[var(--text-secondary)] capitalize">
              {status === 'interviewing' ? 'Interview in Progress' :
               status === 'processing' ? 'Processing...' :
               'Complete'}
            </span>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--clinical-gray-50)] rounded-lg">
            <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-sm font-mono font-medium text-[var(--text-primary)]">
              {formatTime(elapsedTime)}
            </span>
          </div>

          {/* Hints Counter */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--clinical-blue)]/10 rounded-lg">
            <Lightbulb className="w-4 h-4 text-[var(--clinical-blue)]" />
            <span className="text-sm font-medium text-[var(--clinical-blue)]">
              {hintsUsed} {hintsUsed === 1 ? 'Hint' : 'Hints'} Received
            </span>
          </div>
        </div>

        {/* Right: Action Button */}
        <div>
          {status === 'interviewing' && (
            <button
              onClick={handleSubmit}
              className="btn btn-success flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Submit Solution
            </button>
          )}

          {status === 'processing' && (
            <button
              disabled
              className="btn btn-secondary flex items-center gap-2 opacity-75 cursor-not-allowed"
            >
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Processing Interview...
            </button>
          )}

          {status === 'complete' && (
            <button
              disabled
              className="btn btn-primary flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Interview Complete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
