'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface DIDCredentials {
  apiKey: string
  sourceImageUrl: string // URL to the avatar's face photo
}

interface DIDStreamResponse {
  id: string
  session_id: string
  offer: RTCSessionDescriptionInit
  ice_servers: RTCIceServer[]
}

/**
 * D-ID Avatar Component
 *
 * Displays a realistic lip-synced video avatar using D-ID's streaming API.
 * Receives audio from the parent component and syncs the avatar's lips.
 *
 * Cost: ~$0.10/min
 *
 * Usage:
 * <DIDAvatar
 *   apiKey={process.env.NEXT_PUBLIC_DID_API_KEY}
 *   sourceImageUrl="https://path/to/sarah-headshot.jpg"
 *   onReady={(speak) => { speak("Hello! I'm Sarah."); }}
 * />
 */
export default function DIDAvatar({
  apiKey,
  sourceImageUrl,
  voiceId = 'en-US-JennyNeural', // Microsoft Azure voice
  onReady,
  onSpeaking,
  onError,
}: {
  apiKey: string
  sourceImageUrl: string
  voiceId?: string
  onReady?: (speak: (text: string) => Promise<void>) => void
  onSpeaking?: (isSpeaking: boolean) => void
  onError?: (error: Error) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const [streamId, setStreamId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Create D-ID stream
  const createStream = useCallback(async () => {
    try {
      const response = await fetch('https://api.d-id.com/talks/streams', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_url: sourceImageUrl,
          driver_url: 'bank://lively', // Idle animation
          config: { stitch: true },
        }),
      })

      if (!response.ok) {
        throw new Error(`D-ID stream creation failed: ${response.status}`)
      }

      const data: DIDStreamResponse = await response.json()
      setStreamId(data.id)
      setSessionId(data.session_id)

      // Set up WebRTC connection
      const pc = new RTCPeerConnection({
        iceServers: data.ice_servers,
      })

      peerConnectionRef.current = pc

      // Handle incoming video track
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0]
        }
      }

      // Handle ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await fetch(`https://api.d-id.com/talks/streams/${data.id}/ice`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              candidate: event.candidate,
              session_id: data.session_id,
            }),
          })
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setIsConnected(true)
        }
      }

      // Set remote description (D-ID's offer)
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer))

      // Create and send answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await fetch(`https://api.d-id.com/talks/streams/${data.id}/sdp`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answer: answer,
          session_id: data.session_id,
        }),
      })

      return data

    } catch (error) {
      console.error('D-ID stream error:', error)
      onError?.(error as Error)
      throw error
    }
  }, [apiKey, sourceImageUrl, onError])

  // Speak function - makes avatar say text
  const speak = useCallback(async (text: string) => {
    if (!streamId || !sessionId) {
      console.warn('D-ID stream not ready')
      return
    }

    setIsSpeaking(true)
    onSpeaking?.(true)

    try {
      const response = await fetch(`https://api.d-id.com/talks/streams/${streamId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: {
            type: 'text',
            input: text,
            provider: {
              type: 'microsoft',
              voice_id: voiceId,
            },
          },
          config: { stitch: true },
          session_id: sessionId,
        }),
      })

      if (!response.ok) {
        throw new Error(`D-ID speak failed: ${response.status}`)
      }

      const data = await response.json()

      // Estimate duration based on text length (~150 words per minute)
      const wordCount = text.split(' ').length
      const durationMs = (wordCount / 150) * 60 * 1000 + 500

      // Stop speaking after estimated duration
      setTimeout(() => {
        setIsSpeaking(false)
        onSpeaking?.(false)
      }, durationMs)

      return data

    } catch (error) {
      console.error('D-ID speak error:', error)
      setIsSpeaking(false)
      onSpeaking?.(false)
      throw error
    }
  }, [streamId, sessionId, apiKey, voiceId, onSpeaking])

  // Speak with pre-generated audio URL
  const speakWithAudio = useCallback(async (audioUrl: string) => {
    if (!streamId || !sessionId) return

    setIsSpeaking(true)
    onSpeaking?.(true)

    try {
      const response = await fetch(`https://api.d-id.com/talks/streams/${streamId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: {
            type: 'audio',
            audio_url: audioUrl,
          },
          config: { stitch: true },
          session_id: sessionId,
        }),
      })

      if (!response.ok) {
        throw new Error(`D-ID audio speak failed: ${response.status}`)
      }

      return await response.json()

    } catch (error) {
      console.error('D-ID audio error:', error)
      setIsSpeaking(false)
      onSpeaking?.(false)
      throw error
    }
  }, [streamId, sessionId, apiKey, onSpeaking])

  // Initialize stream on mount
  useEffect(() => {
    if (!apiKey || !sourceImageUrl) return

    createStream().then(() => {
      // Provide speak function to parent
      onReady?.(speak)
    })

    return () => {
      // Cleanup: close stream
      if (streamId && sessionId) {
        fetch(`https://api.d-id.com/talks/streams/${streamId}?session_id=${sessionId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${apiKey}`,
          },
        }).catch(console.error)
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
    }
  }, [apiKey, sourceImageUrl, createStream, onReady, speak, streamId, sessionId])

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      {/* D-ID Video Stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Connection status overlay */}
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-4">
            <div className="w-10 h-10 mx-auto border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-white/80">Connecting to avatar...</p>
          </div>
        </div>
      )}

      {/* Speaking indicator */}
      {isConnected && isSpeaking && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse" />
          <span className="text-xs text-white">Speaking</span>
        </div>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
        <h3 className="font-display text-lg text-white">Sarah</h3>
        <p className="text-xs text-white/70">AI Interviewer</p>
      </div>
    </div>
  )
}

/**
 * Fallback component when D-ID is not configured
 */
export function DIDNotConfigured() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)] rounded-xl">
      <div className="text-center space-y-4 p-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--accent-amber)]/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--accent-amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Video Avatar Not Configured</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Set NEXT_PUBLIC_DID_API_KEY to enable D-ID avatar
          </p>
        </div>
      </div>
    </div>
  )
}
