'use client'

import { useState, useEffect, useRef } from 'react'

interface AnimatedAvatarProps {
  name: string
  isSpeaking: boolean
  imageUrl?: string // Optional: real photo for more realism
}

/**
 * Animated Avatar Component
 *
 * A free alternative to D-ID that shows a speaking animation.
 * Uses CSS animations for lip movement and expression changes.
 *
 * For hackathon: Shows the concept without the $0.10/min cost.
 * For production: Replace with D-ID or Simli integration.
 */
export default function AnimatedAvatar({ name, isSpeaking, imageUrl }: AnimatedAvatarProps) {
  const [mouthOpen, setMouthOpen] = useState(false)
  const [blinkState, setBlinkState] = useState(false)
  const animationRef = useRef<NodeJS.Timeout | null>(null)

  // Simulate mouth movement when speaking
  useEffect(() => {
    if (isSpeaking) {
      // Random mouth movements while speaking
      const animateMouth = () => {
        setMouthOpen(Math.random() > 0.4)
        animationRef.current = setTimeout(animateMouth, 100 + Math.random() * 150)
      }
      animateMouth()
    } else {
      setMouthOpen(false)
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [isSpeaking])

  // Natural blinking
  useEffect(() => {
    const blink = () => {
      setBlinkState(true)
      setTimeout(() => setBlinkState(false), 150)
    }

    const blinkInterval = setInterval(blink, 3000 + Math.random() * 2000)
    return () => clearInterval(blinkInterval)
  }, [])

  // If real image provided, show it with overlay effects
  if (imageUrl) {
    return (
      <div className="relative w-full h-full">
        {/* Real photo */}
        <img
          src={imageUrl}
          alt={name}
          className={`w-full h-full object-cover transition-all duration-200 ${
            isSpeaking ? 'brightness-105' : ''
          }`}
        />

        {/* Speaking indicator overlay */}
        {isSpeaking && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <SpeakingWaveform />
          </div>
        )}

        {/* Glow effect when speaking */}
        {isSpeaking && (
          <div className="absolute inset-0 ring-4 ring-[var(--accent-emerald)] ring-opacity-50 animate-pulse rounded-xl" />
        )}
      </div>
    )
  }

  // SVG animated avatar (free, no API needed)
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-secondary)]">
      <svg
        viewBox="0 0 200 200"
        className={`w-48 h-48 transition-transform duration-300 ${isSpeaking ? 'scale-105' : ''}`}
      >
        {/* Face circle */}
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="#FFE4C4"
          className={isSpeaking ? 'animate-pulse' : ''}
        />

        {/* Hair */}
        <ellipse cx="100" cy="50" rx="70" ry="40" fill="#4A3728" />
        <ellipse cx="100" cy="35" rx="60" ry="30" fill="#5D4037" />

        {/* Eyes */}
        <g className="eyes">
          {/* Left eye */}
          <ellipse
            cx="70"
            cy="90"
            rx={blinkState ? 8 : 8}
            ry={blinkState ? 2 : 10}
            fill="white"
            className="transition-all duration-100"
          />
          <circle cx="70" cy="90" r={blinkState ? 0 : 5} fill="#2C1810" />
          <circle cx="72" cy="88" r={blinkState ? 0 : 2} fill="white" />

          {/* Right eye */}
          <ellipse
            cx="130"
            cy="90"
            rx={blinkState ? 8 : 8}
            ry={blinkState ? 2 : 10}
            fill="white"
            className="transition-all duration-100"
          />
          <circle cx="130" cy="90" r={blinkState ? 0 : 5} fill="#2C1810" />
          <circle cx="132" cy="88" r={blinkState ? 0 : 2} fill="white" />
        </g>

        {/* Eyebrows */}
        <path
          d="M55 75 Q70 70 85 75"
          fill="none"
          stroke="#4A3728"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M115 75 Q130 70 145 75"
          fill="none"
          stroke="#4A3728"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Nose */}
        <path
          d="M100 95 L95 115 Q100 118 105 115 Z"
          fill="#EECBAD"
        />

        {/* Mouth - animates when speaking */}
        <ellipse
          cx="100"
          cy="140"
          rx={isSpeaking && mouthOpen ? 15 : 12}
          ry={isSpeaking && mouthOpen ? 10 : 4}
          fill={isSpeaking && mouthOpen ? '#8B0000' : '#CC6666'}
          className="transition-all duration-75"
        />

        {/* Teeth (visible when speaking) */}
        {isSpeaking && mouthOpen && (
          <rect x="90" y="135" width="20" height="5" fill="white" rx="2" />
        )}

        {/* Cheeks (blush) */}
        <circle cx="55" cy="115" r="12" fill="#FFCCCC" opacity="0.5" />
        <circle cx="145" cy="115" r="12" fill="#FFCCCC" opacity="0.5" />

        {/* Ears */}
        <ellipse cx="25" cy="100" rx="10" ry="15" fill="#FFE4C4" />
        <ellipse cx="175" cy="100" rx="10" ry="15" fill="#FFE4C4" />
      </svg>

      {/* Name badge */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
        <h3 className="font-display text-lg text-[var(--text-primary)]">{name}</h3>
        <p className="text-xs text-[var(--text-tertiary)]">AI Interviewer</p>
      </div>

      {/* Speaking waveform */}
      {isSpeaking && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <SpeakingWaveform />
        </div>
      )}
    </div>
  )
}

/**
 * Audio waveform visualization for speaking state
 */
function SpeakingWaveform() {
  return (
    <div className="flex items-center justify-center gap-1">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="w-1 bg-[var(--accent-emerald)] rounded-full"
          style={{
            animation: `waveform 0.5s ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
            height: '20px',
          }}
        />
      ))}
      <style jsx>{`
        @keyframes waveform {
          0%, 100% {
            height: 8px;
          }
          50% {
            height: 20px;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Professional headshot avatar with speaking effects
 * Use this if you have a real photo of "Sarah"
 */
export function PhotoAvatar({
  name,
  isSpeaking,
  photoUrl,
}: {
  name: string
  isSpeaking: boolean
  photoUrl: string
}) {
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-primary)]/20 to-transparent" />

      {/* Photo */}
      <img
        src={photoUrl}
        alt={name}
        className={`w-full h-full object-cover transition-all duration-300 ${
          isSpeaking ? 'scale-[1.02] brightness-110' : ''
        }`}
      />

      {/* Speaking ring effect */}
      {isSpeaking && (
        <>
          <div className="absolute inset-0 ring-4 ring-[var(--accent-emerald)] ring-opacity-60 animate-pulse" />
          <div className="absolute inset-0 bg-[var(--accent-emerald)]/10 animate-pulse" />
        </>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Name and status */}
      <div className="absolute bottom-4 left-4">
        <h3 className="font-display text-xl text-white">{name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-white/80">AI Interviewer</span>
          {isSpeaking && (
            <span className="flex items-center gap-1 text-[var(--accent-emerald)]">
              <span className="w-2 h-2 bg-current rounded-full animate-pulse" />
              <span className="text-xs">Speaking</span>
            </span>
          )}
        </div>
      </div>

      {/* Waveform overlay */}
      {isSpeaking && (
        <div className="absolute bottom-4 right-4">
          <SpeakingWaveform />
        </div>
      )}
    </div>
  )
}
