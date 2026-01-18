'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import {
  LiveKitRoom as LKRoom,
  useRoomContext,
  useParticipants,
  useLocalParticipant,
  useTracks,
  AudioTrack,
  VideoTrack,
  useConnectionState,
} from '@livekit/components-react'
import { Track, RoomEvent, ConnectionState } from 'livekit-client'
import AnimatedAvatar from './AnimatedAvatar'
import DIDAvatar from './DIDAvatar'

// Avatar mode: 'animated' (free), 'did' (paid), 'simple' (just circle)
type AvatarMode = 'animated' | 'did' | 'simple'

// Layout mode: 'default' (PiP style), 'side-by-side' (Zoom style)
type LayoutMode = 'default' | 'side-by-side'

interface LiveKitRoomProps {
  sessionId: string
  candidateName: string
  onConnect?: () => void
  onMessage?: (text: string) => void
  onDisconnect?: () => void
  avatarMode?: AvatarMode
  layout?: LayoutMode
}

// LiveKit server URL from environment
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || ''
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// D-ID configuration from environment
const DID_API_KEY = process.env.NEXT_PUBLIC_DID_API_KEY || ''
const DID_SOURCE_IMAGE = process.env.NEXT_PUBLIC_DID_SOURCE_IMAGE || 'https://create-images-results.d-id.com/google-oauth2%7C107325163050897822204/upl_hRvkNLiXYkEYbKVxYb3rY/image.png'

function LiveKitRoomWrapperInner({ sessionId, candidateName, onConnect, onMessage, onDisconnect, avatarMode = 'animated', layout = 'default' }: LiveKitRoomProps) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch LiveKit token from backend with timeout
  useEffect(() => {
    const fetchToken = async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout (fast fail for tests)

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/token?session_id=${encodeURIComponent(sessionId)}&candidate_name=${encodeURIComponent(candidateName)}`,
          { signal: controller.signal }
        )
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ detail: 'Failed to get token' }))
          throw new Error(errData.detail || 'Failed to get LiveKit token')
        }

        const data = await response.json()
        setToken(data.token)
        setIsLoading(false)
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          console.log('LiveKit token fetch aborted')
          return
        }
        console.error('LiveKit token error:', err)
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setIsLoading(false)
      }
    }

    if (LIVEKIT_URL) {
      fetchToken()
    } else {
      setError('LiveKit URL not configured')
      setIsLoading(false)
    }
  }, [sessionId, candidateName])

  if (isLoading) {
    return (
      <div className="relative w-full h-full bg-[var(--bg-tertiary)] rounded-xl overflow-hidden flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 mx-auto border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Connecting to interview room...</p>
        </div>
      </div>
    )
  }

  // Show demo mode with animated avatar when LiveKit is not configured
  if (error || !token || !LIVEKIT_URL) {
    return (
      <DemoModeAvatar
        candidateName={candidateName}
        onMessage={onMessage}
        layout={layout}
      />
    )
  }

  return (
    <div className="w-full h-full">
      <LKRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect={true}
        audio={true}
        video={true}
        onConnected={() => {
          console.log('Connected to LiveKit room')
          onConnect?.()
        }}
        onDisconnected={() => {
          console.log('Disconnected from LiveKit room')
          onDisconnect?.()
        }}
        onError={(err) => {
          console.error('LiveKit error:', err)
          setError(err.message)
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <InterviewRoomContent
          candidateName={candidateName}
          sessionId={sessionId}
          onMessage={onMessage}
          avatarMode={avatarMode}
          layout={layout}
        />
      </LKRoom>
    </div>
  )
}

// Main interview room component (inside LiveKit context)
function InterviewRoomContent({
  candidateName,
  sessionId,
  onMessage,
  avatarMode = 'animated',
  layout = 'default'
}: {
  candidateName: string
  sessionId: string
  onMessage?: (text: string) => void
  avatarMode?: AvatarMode
  layout?: LayoutMode
}) {
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)

  // Get all audio tracks from remote participants (AI agent)
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const remoteAudioTracks = audioTracks.filter(
    track => track.participant.identity !== localParticipant?.identity
  )

  // Get local video track
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: false })
  const localCameraTrack = videoTracks.find(t => t.participant.identity === localParticipant?.identity)

  // Track AI speaking state via active speakers
  useEffect(() => {
    if (!room) return

    const handleActiveSpeakers = (speakers: any[]) => {
      const localId = localParticipant?.identity
      const aiIsSpeaking = speakers.some(s => s.identity !== localId)
      setIsSpeaking(aiIsSpeaking)
    }

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers)

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers)
    }
  }, [room, localParticipant])

  // Handle data channel messages from AI agent
  useEffect(() => {
    if (!room) return

    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      if (participant?.identity === localParticipant?.identity) return

      try {
        const message = new TextDecoder().decode(payload)
        const data = JSON.parse(message)
        if (data.type === 'transcript' || data.type === 'message') {
          onMessage?.(data.text)
        }
      } catch {
        // Plain text message
        const text = new TextDecoder().decode(payload)
        if (text.trim()) {
          onMessage?.(text)
        }
      }
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [room, localParticipant, onMessage])

  // Toggle microphone
  const toggleMic = useCallback(async () => {
    if (localParticipant) {
      const newState = !isMuted
      await localParticipant.setMicrophoneEnabled(!newState)
      setIsMuted(newState)
    }
  }, [localParticipant, isMuted])

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    if (localParticipant) {
      const newState = !isCameraOff
      await localParticipant.setCameraEnabled(!newState)
      setIsCameraOff(newState)
    }
  }, [localParticipant, isCameraOff])

  // Send code snapshot to AI agent via data channel
  const sendCodeSnapshot = useCallback((code: string) => {
    if (room && connectionState === ConnectionState.Connected) {
      const data = JSON.stringify({ type: 'code_snapshot', code })
      const encoder = new TextEncoder()
      room.localParticipant.publishData(encoder.encode(data), { reliable: true })
    }
  }, [room, connectionState])

  // Expose sendCodeSnapshot globally for the interview page
  useEffect(() => {
    (window as any).__areteSendCode = sendCodeSnapshot
    return () => {
      delete (window as any).__areteSendCode
    }
  }, [sendCodeSnapshot])

  // NOTE: When in LIVE mode, TTS comes from the LiveKit agent via AudioTrack
  // Browser TTS is NOT used - the agent publishes audio directly through LiveKit
  // The speakAIMessage function in the interview page should NOT be called in LIVE mode

  const isConnected = connectionState === ConnectionState.Connected

  // Side-by-side Zoom-style layout
  if (layout === 'side-by-side') {
    return (
      <div className="relative w-full h-full bg-[var(--bg-tertiary)] overflow-hidden">
        {/* Render all remote audio tracks (AI agent voice via LiveKit) */}
        {remoteAudioTracks.map((trackRef) => (
          <AudioTrack key={trackRef.publication.trackSid} trackRef={trackRef} />
        ))}

        {/* Side by side video grid */}
        <div className="h-full flex gap-3 p-3">
          {/* AI Avatar - Left Side */}
          <div className="flex-1 relative bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border)]">
            <div className="absolute inset-0 flex items-center justify-center">
              {avatarMode === 'did' && DID_API_KEY ? (
                <DIDAvatar
                  apiKey={DID_API_KEY}
                  sourceImageUrl={DID_SOURCE_IMAGE}
                  onSpeaking={(speaking) => setIsSpeaking(speaking)}
                  onError={(err) => console.error('D-ID error:', err)}
                />
              ) : avatarMode === 'animated' ? (
                <div className="w-full h-full p-4">
                  <AnimatedAvatar name="Sarah" isSpeaking={isSpeaking} />
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <div className={`w-16 h-16 mx-auto rounded-full bg-[var(--accent-primary)] flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'ring-4 ring-[var(--accent-emerald)] ring-opacity-60 scale-105' : ''}`}>
                    <span className="text-xl font-display text-white">S</span>
                  </div>
                  <div>
                    <h3 className="font-display text-sm text-[var(--text-primary)]">Sarah</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">AI Interviewer</p>
                  </div>
                </div>
              )}
            </div>
            {/* AI label */}
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
              Sarah (AI)
            </div>
            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-[var(--accent-emerald)]/20 rounded">
                <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse" />
                <span className="text-xs text-[var(--accent-emerald)]">Speaking</span>
              </div>
            )}
          </div>

          {/* Candidate Video - Right Side */}
          <div className="flex-1 relative bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border)]">
            {!isCameraOff && localCameraTrack ? (
              <VideoTrack
                trackRef={localCameraTrack}
                className="absolute inset-0 w-full h-full object-cover mirror-mode"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                    <span className="text-xl font-display text-[var(--text-tertiary)]">
                      {candidateName?.charAt(0)?.toUpperCase() || 'Y'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">Camera Off</p>
                </div>
              </div>
            )}
            {/* Candidate label */}
            <div className="absolute bottom-14 left-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
              {candidateName || 'You'}
            </div>
            {/* Mic indicator - shows when listening */}
            {!isMuted && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-1">
                <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse inline-block" />
                <span className="text-xs text-white">LIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Floating Controls - Center Bottom */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2 bg-[var(--bg-secondary)]/90 backdrop-blur-sm rounded-full px-3 py-2 border border-[var(--border)]">
          <button
            onClick={toggleMic}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isMuted
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
              }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleCamera}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isCameraOff
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
              }`}
            title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isCameraOff ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Connection Status Badge */}
        <div className="absolute top-2 left-2">
          {isConnected ? (
            <span className="badge badge-success text-xs">LIVE</span>
          ) : (
            <span className="badge badge-warning text-xs">CONNECTING...</span>
          )}
        </div>
      </div>
    )
  }

  // Default PiP layout (LIVE mode)
  return (
    <div className="relative w-full h-full bg-[var(--bg-tertiary)] rounded-xl overflow-hidden">
      {/* Render all remote audio tracks (AI agent voice via LiveKit) */}
      {remoteAudioTracks.map((trackRef) => (
        <AudioTrack key={trackRef.publication.trackSid} trackRef={trackRef} />
      ))}

      <div className="absolute inset-0 flex flex-col">
        {/* AI Avatar Section */}
        <div className="flex-1 flex items-center justify-center p-4">
          {avatarMode === 'did' && DID_API_KEY ? (
            /* D-ID Video Avatar - Realistic lip-synced video ($0.10/min) */
            <div className="w-full h-full max-w-md max-h-80">
              <DIDAvatar
                apiKey={DID_API_KEY}
                sourceImageUrl={DID_SOURCE_IMAGE}
                onSpeaking={(speaking) => setIsSpeaking(speaking)}
                onError={(err) => console.error('D-ID error:', err)}
              />
            </div>
          ) : avatarMode === 'animated' ? (
            /* Animated SVG Avatar - Free, no API needed */
            <div className="w-full h-full max-w-sm max-h-72">
              <AnimatedAvatar name="Sarah" isSpeaking={isSpeaking} />
            </div>
          ) : (
            /* Simple Avatar - Basic circle with speaking indicator */
            <div className="text-center space-y-3">
              {/* Avatar Circle */}
              <div className={`w-20 h-20 mx-auto rounded-full bg-[var(--accent-primary)] flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'ring-4 ring-[var(--accent-emerald)] ring-opacity-60 scale-105' : ''}`}>
                <span className="text-2xl font-display text-white">S</span>
              </div>

              {/* Name */}
              <div>
                <h3 className="font-display text-lg text-[var(--text-primary)]">Sarah</h3>
                <p className="text-xs text-[var(--text-tertiary)]">AI Interviewer</p>
              </div>

              {/* Speaking Indicator - Audio Waveform */}
              {isSpeaking && (
                <div className="flex items-center justify-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-[var(--accent-emerald)] rounded-full animate-pulse"
                      style={{
                        height: `${12 + Math.sin(Date.now() / 150 + i * 0.5) * 8}px`,
                        animationDelay: `${i * 100}ms`
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Candidate Video (Picture-in-Picture style) */}
        <div className="absolute bottom-3 right-3 w-24 h-18 rounded-lg overflow-hidden bg-black shadow-lg border border-[var(--border)]">
          {!isCameraOff && localCameraTrack ? (
            <VideoTrack
              trackRef={localCameraTrack}
              className="w-full h-full object-cover mirror-mode"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)]">
              <span className="text-xs text-[var(--text-tertiary)]">Camera Off</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-3 left-3 flex gap-2">
          <button
            onClick={toggleMic}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isMuted
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleCamera}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isCameraOff
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isCameraOff ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Connection Status Badge */}
        <div className="absolute top-3 left-3">
          {isConnected ? (
            <span className="badge badge-success text-xs">LIVE</span>
          ) : (
            <span className="badge badge-warning text-xs">CONNECTING...</span>
          )}
        </div>

        {/* Status indicators */}
        <div className="absolute top-3 right-3 flex gap-1">
          {!isMuted && (
            <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse" title="Mic active" />
          )}
          {!isCameraOff && (
            <span className="w-2 h-2 bg-[var(--accent-primary)] rounded-full" title="Camera active" />
          )}
        </div>
      </div>
    </div>
  )
}

// Demo mode component - shows animated avatar when LiveKit is not available
function DemoModeAvatar({
  candidateName,
  onMessage,
  layout = 'default'
}: {
  candidateName: string
  onMessage?: (text: string) => void
  layout?: LayoutMode
}) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isListening, setIsListening] = useState(false)
  // Track if user has interacted (for autoplay policy)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [showStartPrompt, setShowStartPrompt] = useState(true)
  // Error notification states - user requested visible errors
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [speechError, setSpeechError] = useState<string | null>(null)
  // Track if camera stream is ready (to trigger re-render when stream is available)
  const [cameraStreamReady, setCameraStreamReady] = useState(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const isPlayingRef = useRef(false)
  const recognitionRef = useRef<any>(null)
  const lastResponseTimeRef = useRef(0)
  const pendingTranscriptRef = useRef('')
  const transcriptTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Reference to track if we should resume speech recognition
  const isMutedRef = useRef(false)
  const hasUserInteractedRef = useRef(false)

  // Track speech recognition restart state to prevent race conditions
  const restartScheduledRef = useRef(false)
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const serviceNotAllowedRetryCount = useRef(0)
  const ttsJustEndedRef = useRef(false) // Prevent onend from restarting right after TTS

  // Safe speech recognition restart function with debouncing
  const scheduleSpeechRecognitionRestart = useCallback((delayMs: number, reason: string) => {
    // Don't schedule if already scheduled or muted
    if (restartScheduledRef.current || isMutedRef.current) {
      console.log(`🎤 Not scheduling restart (${reason}): already scheduled=${restartScheduledRef.current}, muted=${isMutedRef.current}`)
      return
    }

    // Clear any existing timeout
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }

    restartScheduledRef.current = true
    console.log(`🎤 Scheduling speech recognition restart in ${delayMs}ms (${reason})`)

    restartTimeoutRef.current = setTimeout(() => {
      restartScheduledRef.current = false

      if (!recognitionRef.current || isMutedRef.current || isPlayingRef.current) {
        console.log('🎤 Restart cancelled: recognition=%s, muted=%s, playing=%s',
          !!recognitionRef.current, isMutedRef.current, isPlayingRef.current)
        return
      }

      try {
        recognitionRef.current.start()
        console.log(`🎤 Speech recognition restarted (${reason})`)
        serviceNotAllowedRetryCount.current = 0 // Reset retry count on success
        setSpeechError(null)
      } catch (e: any) {
        console.log('🎤 Could not restart speech recognition:', e.message || e)
        // If it fails, we'll try again on the next natural restart opportunity
      }
    }, delayMs)
  }, [])

  // Helper function to handle TTS completion (queue processing and speech recognition restart)
  const handleTTSComplete = useCallback(() => {
    setIsSpeaking(false)
    isPlayingRef.current = false

    // Play next in queue if any (before restarting recognition)
    if (audioQueueRef.current.length > 0) {
      const nextText = audioQueueRef.current.shift()!
      // Use setTimeout to avoid recursive stack issues - trigger through global function
      setTimeout(() => {
        if ((window as any).__areteSpeakAI) {
          (window as any).__areteSpeakAI(nextText)
        }
      }, 100)
      return // Don't restart recognition yet, more audio coming
    }

    // Mark that TTS just ended - prevents onend handler from also trying to restart
    ttsJustEndedRef.current = true
    setTimeout(() => {
      ttsJustEndedRef.current = false
    }, 3000) // Clear the flag after 3 seconds

    // Restart speech recognition after TTS finishes (if not muted)
    console.log('🎤 TTS ended, scheduling speech recognition restart. isMuted:', isMutedRef.current)
    if (!isMutedRef.current) {
      scheduleSpeechRecognitionRestart(2500, 'after TTS ended')
    } else {
      console.log('🎤 Not restarting speech recognition - muted')
    }
  }, [scheduleSpeechRecognitionRestart])

  // Fallback to browser's built-in speech synthesis when ElevenLabs fails
  const speakWithBrowserTTS = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.error('🔊 Browser TTS not supported')
      setTtsError('TTS not supported in this browser')
      handleTTSComplete()
      return
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()
    setIsSpeaking(true)
    console.log('🔊 Using browser TTS fallback for:', text.substring(0, 50) + '...')

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Try to find a female voice for Sarah
    const voices = window.speechSynthesis.getVoices()
    const femaleVoice = voices.find(v =>
      v.name.toLowerCase().includes('samantha') ||
      v.name.toLowerCase().includes('victoria') ||
      v.name.toLowerCase().includes('karen') ||
      v.name.toLowerCase().includes('female')
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0]

    if (femaleVoice) {
      utterance.voice = femaleVoice
      console.log('🔊 Using browser voice:', femaleVoice.name)
    }

    utterance.onstart = () => {
      console.log('🔊 Browser TTS started')
      setIsSpeaking(true)
      setTtsError(null)
    }

    utterance.onend = () => {
      console.log('🔊 Browser TTS ended')
      handleTTSComplete()
    }

    utterance.onerror = (e) => {
      console.error('🔊 Browser TTS error:', e)
      setTtsError('Audio blocked - click page to enable')
      handleTTSComplete()
    }

    window.speechSynthesis.speak(utterance)
  }, [handleTTSComplete])

  // TTS speak function using ElevenLabs API with browser fallback
  const speakText = useCallback(async (text: string) => {
    // Clear any previous TTS error
    setTtsError(null)

    // Mark as playing IMMEDIATELY to prevent recognition restart
    isPlayingRef.current = true

    // Clear the ttsJustEnded flag since we're starting new TTS
    ttsJustEndedRef.current = false

    // Cancel any pending speech recognition restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }
    restartScheduledRef.current = false

    // IMMEDIATELY stop speech recognition to prevent feedback loop
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
        console.log('🔇 STOPPED speech recognition for TTS')
      } catch (e) {
        // Already stopped
      }
    }

    try {
      setIsSpeaking(true)
      console.log('🔊 TTS: Fetching audio for:', text.substring(0, 50) + '...')

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('🔊 TTS API error:', errorText, '- falling back to browser TTS')
        // Fallback to browser TTS
        speakWithBrowserTTS(text)
        return
      }

      const audioBlob = await response.blob()
      console.log('🔊 TTS: Received audio blob, size:', audioBlob.size, 'bytes, type:', audioBlob.type)

      if (audioBlob.size < 100) {
        console.error('🔊 TTS: Audio blob too small - falling back to browser TTS')
        speakWithBrowserTTS(text)
        return
      }

      const audioUrl = URL.createObjectURL(audioBlob)
      console.log('🔊 TTS: Created audio URL:', audioUrl)

      if (audioRef.current) {
        audioRef.current.pause()
      }

      const audio = new Audio(audioUrl)
      audio.volume = 1.0
      audioRef.current = audio

      audio.onended = () => {
        console.log('🔊 TTS audio ended')
        URL.revokeObjectURL(audioUrl)
        handleTTSComplete()
      }

      audio.onerror = (e) => {
        console.error('🔊 TTS audio element error:', e, '- falling back to browser TTS')
        URL.revokeObjectURL(audioUrl)
        // Fallback to browser TTS on audio element error
        speakWithBrowserTTS(text)
      }

      console.log('🔊 TTS: Attempting to play audio...')

      try {
        await audio.play()
        console.log('🔊 TTS audio playing successfully, duration:', audio.duration, 'seconds')
        // Clear error on success
        setTtsError(null)
      } catch (playError: any) {
        console.error('🔊 TTS audio play failed:', playError, '- falling back to browser TTS')
        URL.revokeObjectURL(audioUrl)
        // Fallback to browser TTS when autoplay is blocked
        speakWithBrowserTTS(text)
      }
    } catch (error: any) {
      console.error('🔊 TTS error:', error, '- falling back to browser TTS')
      // Fallback to browser TTS on any error
      speakWithBrowserTTS(text)
    }
  }, [speakWithBrowserTTS, handleTTSComplete])

  // Expose speak function globally for the interview page
  useEffect(() => {
    (window as any).__areteSpeakAI = (text: string) => {
      if (isPlayingRef.current) {
        // Queue the message if already speaking
        audioQueueRef.current.push(text)
      } else {
        speakText(text)
      }
    }
    return () => {
      delete (window as any).__areteSpeakAI
    }
  }, [speakText])

  // Handle user interaction to enable audio (bypasses autoplay policy)
  const handleStartInterview = useCallback(() => {
    console.log('🎬 User clicked to start interview - audio now enabled')
    setHasUserInteracted(true)
    hasUserInteractedRef.current = true
    setShowStartPrompt(false)

    // Now play the greeting since user has interacted
    const greeting = "Hi! I'm Sarah, your AI interviewer. Let's solve the Two Sum problem together."
    onMessage?.(greeting)
    speakText(greeting)
  }, [onMessage, speakText])

  // Initial greeting with TTS - wait for user interaction due to browser autoplay policy
  const hasGreetedRef = useRef(false)
  useEffect(() => {
    if (hasGreetedRef.current) return

    // Only show text greeting, don't try to play audio until user interacts
    const greeting = "Hi! I'm Sarah, your AI interviewer. Let's solve the Two Sum problem together."

    // Add greeting to transcript immediately so user sees it
    const initialTimer = setTimeout(() => {
      onMessage?.(greeting)

      // If user has already interacted (e.g., clicked elsewhere first), play audio
      if (hasUserInteractedRef.current) {
        hasGreetedRef.current = true
        speakText(greeting)
      }
      // Otherwise, wait for user to click the "Start" button
    }, 1500)

    return () => clearTimeout(initialTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - only run on mount

  // Listen for any user interaction to enable audio
  useEffect(() => {
    const handleInteraction = () => {
      if (!hasUserInteractedRef.current) {
        console.log('🎬 User interaction detected - audio enabled')
        setHasUserInteracted(true)
        hasUserInteractedRef.current = true
      }
    }

    // These events indicate user interaction
    window.addEventListener('click', handleInteraction)
    window.addEventListener('keydown', handleInteraction)
    window.addEventListener('touchstart', handleInteraction)

    return () => {
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('touchstart', handleInteraction)
    }
  }, [])

  // Set up local camera preview - only obtains the stream
  useEffect(() => {
    let mounted = true

    const setupCamera = async () => {
      try {
        console.log('📷 Requesting camera access...')
        setCameraError(null)
        setCameraStreamReady(false)

        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('Camera API not available in this browser')
          console.error('📷 Camera API not available')
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: true
        })

        if (!mounted) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        mediaStreamRef.current = stream
        console.log('📷 Camera stream obtained, tracks:', stream.getTracks().map(t => `${t.kind}:${t.label}`))

        // Check if video track is active
        const videoTrack = stream.getVideoTracks()[0]
        if (!videoTrack || !videoTrack.enabled) {
          console.error('📷 No video track or track disabled')
          setCameraError('Camera track not available')
          return
        }

        console.log('📷 Video track settings:', videoTrack.getSettings())

        // Mark stream as ready - this triggers the second useEffect to attach it
        setCameraStreamReady(true)
        setCameraError(null)

      } catch (err: any) {
        console.error('📷 Camera error:', err)
        if (err.name === 'NotAllowedError') {
          setCameraError('Camera permission denied - please allow camera access')
        } else if (err.name === 'NotFoundError') {
          setCameraError('No camera found on this device')
        } else if (err.name === 'NotReadableError') {
          setCameraError('Camera is in use by another app')
        } else {
          setCameraError(`Camera error: ${err.message || err.name || 'Unknown'}`)
        }
      }
    }

    if (!isCameraOff) {
      setupCamera()
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      setCameraStreamReady(false)
      setCameraError(null)
    }

    return () => {
      mounted = false
    }
  }, [isCameraOff])

  // Attach camera stream to video element when both are ready
  // This useEffect runs whenever cameraStreamReady changes or component re-renders
  useEffect(() => {
    if (!cameraStreamReady || !mediaStreamRef.current || isCameraOff) {
      return
    }

    let retryIntervalId: ReturnType<typeof setInterval> | null = null

    const attachStream = () => {
      const videoEl = localVideoRef.current
      if (!videoEl) {
        console.log('📷 Video element not yet available, will retry...')
        return false
      }

      // Check if stream is already attached
      if (videoEl.srcObject === mediaStreamRef.current) {
        console.log('📷 Stream already attached')
        return true
      }

      console.log('📷 Attaching stream to video element')
      videoEl.srcObject = mediaStreamRef.current

      // Handle the canplay event for reliable playback
      const handleCanPlay = () => {
        console.log('📷 Video can play, starting...')
        videoEl.play()
          .then(() => {
            console.log('📷 Video playing successfully')
            setCameraError(null)
          })
          .catch(e => {
            console.log('📷 Autoplay blocked:', e)
            // Most browsers allow muted autoplay, so this should rarely happen
            setCameraError('Click the video to start camera')
          })
      }

      videoEl.addEventListener('canplay', handleCanPlay, { once: true })

      // If the video is already ready to play, play immediately
      if (videoEl.readyState >= 3) {
        console.log('📷 Video already has data, playing immediately')
        videoEl.play().catch(() => { })
      }

      return true
    }

    // Try to attach immediately
    if (!attachStream()) {
      // If video element isn't ready, retry a few times with shorter intervals
      let retryCount = 0
      const maxRetries = 20
      retryIntervalId = setInterval(() => {
        retryCount++
        console.log('📷 Retry', retryCount, 'attaching stream')
        if (attachStream() || retryCount >= maxRetries) {
          if (retryIntervalId) clearInterval(retryIntervalId)
          if (retryCount >= maxRetries) {
            console.log('📷 Max retries reached, video element not found')
            setCameraError('Could not display camera')
          }
        }
      }, 100) // 100ms retries, up to 2 seconds total
    }

    return () => {
      if (retryIntervalId) clearInterval(retryIntervalId)
    }
  }, [cameraStreamReady, isCameraOff])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Speech recognition for Demo mode - allows AI to hear you
  useEffect(() => {
    // Set up Web Speech API for speech-to-text
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.log('🎤 Speech recognition not supported in this browser')
      setSpeechError('Speech recognition not supported in this browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      console.log('🎤 Speech recognition started - AI can now hear you')
      setIsListening(true)
      setSpeechError(null) // Clear error on successful start
      serviceNotAllowedRetryCount.current = 0 // Reset retry count on successful start
      restartScheduledRef.current = false // Clear the scheduled flag
    }

    recognition.onresult = (event: any) => {
      // Don't process if AI is speaking (feedback loop prevention)
      if (isPlayingRef.current) {
        console.log('🔇 Ignoring speech - AI is talking')
        return
      }

      const lastResult = event.results[event.results.length - 1]
      if (lastResult.isFinal) {
        const transcript = lastResult[0].transcript.trim()

        // Ignore very short fragments (likely noise)
        if (!transcript || transcript.length < 3) {
          return
        }

        console.log('🎤 You said:', transcript)

        // Accumulate transcript and debounce
        pendingTranscriptRef.current += ' ' + transcript

        // Clear existing timeout
        if (transcriptTimeoutRef.current) {
          clearTimeout(transcriptTimeoutRef.current)
        }

        // Wait for user to stop speaking before responding
        transcriptTimeoutRef.current = setTimeout(() => {
          const fullTranscript = pendingTranscriptRef.current.trim()
          pendingTranscriptRef.current = ''

          if (!fullTranscript) return

          // Check cooldown (minimum 3 seconds between AI responses)
          const now = Date.now()
          if (now - lastResponseTimeRef.current < 3000) {
            console.log('🔇 Cooldown active, skipping response')
            // Still add to transcript, just don't respond
            onMessage?.(`You: ${fullTranscript}`)
            return
          }

          // Don't respond if AI started speaking while we were waiting
          if (isPlayingRef.current) {
            console.log('🔇 AI started speaking, skipping response')
            onMessage?.(`You: ${fullTranscript}`)
            return
          }

          lastResponseTimeRef.current = now

          // Add user message to transcript
          onMessage?.(`You: ${fullTranscript}`)

          // Send to AI for response
          handleUserSpeech(fullTranscript)
        }, 1500) // Wait 1.5 seconds of silence before responding
      }
    }

    recognition.onerror = (event: any) => {
      console.log('🎤 Speech recognition error:', event.error)
      if (event.error === 'not-allowed') {
        setSpeechError('Microphone permission denied - please allow mic access')
      } else if (event.error === 'service-not-allowed') {
        // This happens when Chrome's speech service is blocked, rate-limited, or tab lost focus
        // Use exponential backoff: 3s, 6s, 12s, max 15s
        serviceNotAllowedRetryCount.current++
        const baseDelay = 3000
        const delay = Math.min(baseDelay * Math.pow(2, serviceNotAllowedRetryCount.current - 1), 15000)

        console.log(`🎤 Speech service not allowed (attempt ${serviceNotAllowedRetryCount.current}) - retrying in ${delay}ms...`)

        // Show error only after multiple failures
        if (serviceNotAllowedRetryCount.current >= 3) {
          setSpeechError('Speech service busy - retrying...')
        }

        // Use the debounced restart function with exponential backoff
        scheduleSpeechRecognitionRestart(delay, `service-not-allowed retry #${serviceNotAllowedRetryCount.current}`)
      } else if (event.error === 'no-speech') {
        // Don't show error for no-speech, it's normal - just restart
        console.log('🎤 No speech detected, will auto-restart')
      } else if (event.error === 'audio-capture') {
        setSpeechError('No microphone found')
      } else if (event.error === 'network') {
        setSpeechError('Speech recognition network error')
      } else if (event.error !== 'aborted') {
        // Don't show error for aborted (we abort it ourselves)
        setSpeechError(`Speech error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      console.log('🎤 Speech recognition ended, isMuted:', isMutedRef.current, 'isPlaying:', isPlayingRef.current, 'ttsJustEnded:', ttsJustEndedRef.current)
      setIsListening(false)

      // If TTS just ended, don't restart here - let the TTS handler do it with proper delay
      if (ttsJustEndedRef.current) {
        console.log('🎤 TTS just ended, letting TTS handler manage restart')
        return
      }

      // Only restart if not muted AND not playing TTS (to prevent feedback loop)
      // Use isMutedRef.current to avoid stale closure
      if (!isMutedRef.current && !isPlayingRef.current && recognitionRef.current) {
        // Add small delay to avoid rapid restart issues
        scheduleSpeechRecognitionRestart(500, 'after recognition ended')
      } else {
        console.log('🎤 Not restarting: muted or TTS playing')
      }
    }

    recognitionRef.current = recognition

    // Start listening if not muted
    if (!isMuted) {
      try {
        recognition.start()
        console.log('🎤 Starting speech recognition')
      } catch (e: any) {
        console.log('🎤 Could not start speech recognition:', e)
        setSpeechError(`Could not start mic: ${e.message || 'Unknown error'}`)
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (transcriptTimeoutRef.current) {
        clearTimeout(transcriptTimeoutRef.current)
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      restartScheduledRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle user speech - generate AI response via backend API
  const handleUserSpeech = useCallback(async (userText: string) => {
    // Don't respond if already speaking
    if (isPlayingRef.current) {
      console.log('🔇 Already speaking, skipping response')
      return
    }

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

    try {
      console.log('🤖 Sending to AI:', userText)

      // Get current code from the editor (if available)
      const currentCode = (window as any).__areteCurrentCode || ''

      const response = await fetch(`${API_BASE}/api/v1/interviews/demo/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          code: currentCode
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const aiResponse = data.response

      console.log('🤖 AI response:', aiResponse)

      // Add AI response to transcript and speak it
      onMessage?.(aiResponse)
      speakText(aiResponse)

    } catch (error) {
      console.error('Failed to get AI response:', error)
      // Fallback response if API fails
      const fallback = "I'm having trouble hearing you. Could you repeat that?"
      onMessage?.(fallback)
      speakText(fallback)
    }
  }, [onMessage, speakText])

  const toggleMic = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    isMutedRef.current = newMuted

    if (recognitionRef.current) {
      if (newMuted) {
        recognitionRef.current.stop()
      } else {
        try {
          recognitionRef.current.start()
        } catch (e) {
          // Already started
        }
      }
    }
  }

  const toggleCamera = () => {
    if (!isCameraOff && mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    setIsCameraOff(!isCameraOff)
  }

  // Side-by-side Zoom-style layout for Demo mode
  if (layout === 'side-by-side') {
    return (
      <div className="relative w-full h-full bg-[var(--bg-tertiary)] overflow-hidden">
        {/* Click to Start Overlay - Required for browser autoplay policy */}
        {showStartPrompt && !hasUserInteracted && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={handleStartInterview}
          >
            <div className="text-center space-y-4 p-8 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-sm mx-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-display text-[var(--text-primary)]">Click to Start Interview</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Click anywhere to enable audio and begin</p>
              </div>
              <button className="btn btn-primary px-6 py-2">
                Start Interview
              </button>
            </div>
          </div>
        )}

        {/* Side by side video grid */}
        <div className="h-full flex gap-3 p-3">
          {/* AI Avatar - Left Side */}
          <div className="flex-1 relative bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border)]">
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <AnimatedAvatar name="Sarah" isSpeaking={isSpeaking} />
            </div>
            {/* AI label */}
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
              Sarah (AI)
            </div>
            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-[var(--accent-emerald)]/20 rounded">
                <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse" />
                <span className="text-xs text-[var(--accent-emerald)]">Speaking</span>
              </div>
            )}
          </div>

          {/* Candidate Video - Right Side (Demo mode uses localVideoRef) */}
          <div className="flex-1 relative bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border)]">
            {!isCameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                    <span className="text-xl font-display text-[var(--text-tertiary)]">
                      {candidateName?.charAt(0)?.toUpperCase() || 'Y'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">Camera Off</p>
                </div>
              </div>
            )}
            {/* Candidate label */}
            <div className="absolute bottom-14 left-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
              {candidateName || 'You'}
            </div>
            {/* Mic indicator - shows when listening */}
            {!isMuted && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-1">
                <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse inline-block" />
                <span className="text-xs text-white">{isListening ? 'Listening...' : 'Mic on'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Floating Controls - Center Bottom */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2 bg-[var(--bg-secondary)]/90 backdrop-blur-sm rounded-full px-3 py-2 border border-[var(--border)]">
          <button
            onClick={toggleMic}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isMuted
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
              }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleCamera}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isCameraOff
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
              }`}
            title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isCameraOff ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Demo Mode Badge */}
        <div className="absolute top-2 left-2">
          <span className="badge badge-warning text-xs">DEMO</span>
        </div>

        {/* Error Notifications - Visible to user as requested */}
        {(cameraError || ttsError || speechError) && (
          <div className="absolute top-2 right-2 max-w-xs space-y-1">
            {cameraError && (
              <div className="bg-red-500/90 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>{cameraError}</span>
              </div>
            )}
            {ttsError && (
              <div className="bg-orange-500/90 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span>{ttsError}</span>
              </div>
            )}
            {speechError && (
              <div className="bg-yellow-500/90 text-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span>{speechError}</span>
              </div>
            )}
          </div>
        )}

      </div>
    )
  }

  // Default PiP layout for Demo mode
  return (
    <div className="relative w-full h-full bg-[var(--bg-tertiary)] rounded-xl overflow-hidden">
      {/* Click to Start Overlay - Required for browser autoplay policy */}
      {showStartPrompt && !hasUserInteracted && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer rounded-xl"
          onClick={handleStartInterview}
        >
          <div className="text-center space-y-4 p-6 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-xs mx-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-display text-[var(--text-primary)]">Click to Start</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Enable audio and begin interview</p>
            </div>
            <button className="btn btn-primary px-5 py-1.5 text-sm">
              Start
            </button>
          </div>
        </div>
      )}

      <div className="absolute inset-0 flex flex-col">
        {/* AI Avatar Section - Animated Avatar */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full h-full max-w-sm max-h-72">
            <AnimatedAvatar name="Sarah" isSpeaking={isSpeaking} />
          </div>
        </div>

        {/* Candidate Video (Picture-in-Picture style) - Demo mode */}
        <div className="absolute bottom-3 right-3 w-24 h-18 rounded-lg overflow-hidden bg-black shadow-lg border border-[var(--border)]">
          {!isCameraOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)]">
              <span className="text-xs text-[var(--text-tertiary)]">Camera Off</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-3 left-3 flex gap-2">
          <button
            onClick={toggleMic}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isMuted
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleCamera}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isCameraOff
              ? 'bg-[var(--accent-rose)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isCameraOff ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Demo Mode Badge */}
        <div className="absolute top-3 left-3">
          <span className="badge badge-warning text-xs">DEMO MODE</span>
        </div>

        {/* Status indicators */}
        <div className="absolute top-3 right-3 flex gap-1">
          {!isMuted && (
            <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse" title="Mic active" />
          )}
          {!isCameraOff && (
            <span className="w-2 h-2 bg-[var(--accent-primary)] rounded-full" title="Camera active" />
          )}
        </div>

        {/* Error Notifications - Visible to user as requested */}
        {(cameraError || ttsError || speechError) && (
          <div className="absolute top-10 right-3 max-w-xs space-y-1">
            {cameraError && (
              <div className="bg-red-500/90 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>{cameraError}</span>
              </div>
            )}
            {ttsError && (
              <div className="bg-orange-500/90 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span>{ttsError}</span>
              </div>
            )}
            {speechError && (
              <div className="bg-yellow-500/90 text-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span>{speechError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Memoize to prevent re-renders from timer updates in parent component
const LiveKitRoomWrapper = memo(LiveKitRoomWrapperInner)
export default LiveKitRoomWrapper
