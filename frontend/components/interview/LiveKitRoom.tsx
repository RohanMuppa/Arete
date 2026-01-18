'use client'

import { useState, useEffect } from 'react'

interface LiveKitRoomProps {
  roomName?: string
  onConnect?: () => void
}

export default function LiveKitRoom({ roomName, onConnect }: LiveKitRoomProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsConnected(true)
      onConnect?.()
    }, 1500)

    return () => clearTimeout(timer)
  }, [onConnect])

  // Simulate speaking animation
  useEffect(() => {
    if (!isConnected) return

    const speakInterval = setInterval(() => {
      setIsSpeaking(prev => !prev)
    }, 2000)

    return () => clearInterval(speakInterval)
  }, [isConnected])

  return (
    <div className="relative w-full h-full bg-[var(--bg-tertiary)] rounded-xl overflow-hidden">
      {/* Connection Loading */}
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-10 h-10 mx-auto border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-secondary)]">
              Connecting...
            </p>
          </div>
        </div>
      )}

      {/* AI Avatar */}
      {isConnected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            {/* Avatar Circle */}
            <div className={`w-24 h-24 mx-auto rounded-full bg-[var(--accent-primary)] flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'ring-4 ring-[var(--accent-emerald)] ring-opacity-50' : ''}`}>
              <span className="text-3xl font-display text-white">S</span>
            </div>

            {/* Name */}
            <div>
              <h3 className="font-display text-xl text-[var(--text-primary)]">Sarah</h3>
              <p className="text-sm text-[var(--text-tertiary)]">AI Interviewer</p>
            </div>

            {/* Speaking Indicator */}
            {isSpeaking && (
              <div className="flex items-center justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-[var(--accent-emerald)] rounded-full animate-pulse"
                    style={{
                      height: `${12 + Math.random() * 16}px`,
                      animationDelay: `${i * 100}ms`
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Badge */}
      {isConnected && (
        <div className="absolute top-3 left-3">
          <span className="badge badge-success text-xs">LIVE</span>
        </div>
      )}
    </div>
  )
}
