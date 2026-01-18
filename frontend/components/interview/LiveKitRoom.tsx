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
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

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
          setError('Connection timed out')
          setIsLoading(false)
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

  // Show error when LiveKit is not configured
  if (error || !token || !LIVEKIT_URL) {
    return (
      <div className="relative w-full h-full bg-[var(--bg-tertiary)] rounded-xl overflow-hidden flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6">
          <div className="w-12 h-12 mx-auto bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-display text-[var(--text-primary)]">Connection Error</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {error || 'Could not connect to the interview room. Please check your configuration.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary px-4 py-2 text-sm"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <LKRoom
        serverUrl={LIVEKIT_URL}
        token={token || undefined}
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
      // Allow receiving from self if it's a transcript update we committed
      // if (participant?.identity === localParticipant?.identity) return

      try {
        const message = new TextDecoder().decode(payload)
        console.log('📨 Data channel message:', message)
        const data = JSON.parse(message)

        if (data.type === 'transcript') {
          // Format based on role for page.tsx handler
          const text = data.role === 'candidate' || data.role === 'user'
            ? `You: ${data.text}`
            : data.text

          onMessage?.(text)
        } else if (data.type === 'message') {
          onMessage?.(data.text)
        }
      } catch (e) {
        console.error('Failed to parse data channel message:', e)
        // Fallback for plain text
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

// Memoize to prevent re-renders from timer updates in parent component
const LiveKitRoomWrapper = memo(LiveKitRoomWrapperInner)
export default LiveKitRoomWrapper
