"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import Image from "next/image"
import type { Character } from "@/lib/types"

interface CameraPreviewProps {
  onVideoRecorded: (videoBlob: Blob) => void
  isProcessing: boolean
  progress?: number
  progressMessage?: string
  isError?: boolean
  // New props for character selection flow
  recordedVideoUrl?: string | null
  showCharacterSelection?: boolean
  characters?: Character[]
  selectedCharacter?: number | null
  onSelectCharacter?: (id: number) => void
  onGenerate?: () => void
  onReRecord?: () => void
  isUploading?: boolean
  customCharacters?: Character[]
  onAddCustomCharacter?: (file: File) => void
  isUploadingCharacter?: boolean
}

export function CameraPreview({ 
  onVideoRecorded, 
  isProcessing, 
  progress, 
  progressMessage, 
  isError,
  recordedVideoUrl,
  showCharacterSelection,
  characters = [],
  selectedCharacter,
  onSelectCharacter,
  onGenerate,
  onReRecord,
  isUploading,
  customCharacters = [],
  onAddCustomCharacter,
  isUploadingCharacter,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const originalStreamRef = useRef<MediaStream | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showFlash, setShowFlash] = useState(false)
  const [showTips, setShowTips] = useState(true)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const isStartingRef = useRef(false)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 1280, aspectRatio: 9/16 },
        audio: true,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        originalStreamRef.current = stream
        setHasPermission(true)
      }
    } catch {
      setHasPermission(false)
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
      }
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [startCamera])

  const beginRecording = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !originalStreamRef.current) return
    
    // Clear any existing timer first
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    // Wait for video to have dimensions
    const width = video.videoWidth || 720
    const height = video.videoHeight || 1280
    
    // Set canvas size to match video
    canvas.width = width
    canvas.height = height

    // Draw mirrored video to canvas
    const drawFrame = () => {
      ctx.save()
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, width, height)
      ctx.restore()
      animationFrameRef.current = requestAnimationFrame(drawFrame)
    }
    drawFrame()

    // Get canvas stream and add audio from original stream
    const canvasStream = canvas.captureStream(30)
    const audioTracks = originalStreamRef.current.getAudioTracks()
    audioTracks.forEach(track => canvasStream.addTrack(track))

    chunksRef.current = []
    
    // Try to use mp4 if supported, otherwise fall back to webm
    const mimeType = MediaRecorder.isTypeSupported("video/mp4") 
      ? "video/mp4" 
      : "video/webm;codecs=vp8,opus"
    
    const mediaRecorder = new MediaRecorder(canvasStream, { mimeType })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = () => {
      // Stop canvas drawing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      const blob = new Blob(chunksRef.current, { type: mimeType })
      onVideoRecorded(blob)
    }

    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start()
    setIsRecording(true)
    setRecordingTime(0)

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        // Stop at 29 seconds to ensure final video is ~30s max (MediaRecorder adds slight delay)
        if (prev >= 29) {
          // Stop recording
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop()
          }
          setIsRecording(false)
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          return 30 // Display as 30 for user
        }
        return prev + 1
      })
    }, 1000)
  }, [onVideoRecorded])

  const startRecording = useCallback(() => {
    if (!videoRef.current?.srcObject || isStartingRef.current) return
    
    isStartingRef.current = true
    
    // Clear any existing countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    
    // Start countdown
    setCountdown(3)
    
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
          }
          // Flash effect
          setShowFlash(true)
          setTimeout(() => setShowFlash(false), 150)
          // Start actual recording
          setTimeout(() => {
            setCountdown(null)
            beginRecording()
            isStartingRef.current = false
          }, 150)
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [beginRecording])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setIsRecording(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const allCharacters = [...characters, ...customCharacters]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onAddCustomCharacter) {
      onAddCustomCharacter(file)
      e.target.value = ""
    }
  }

  if (hasPermission === false) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Camera access denied</p>
      </div>
    )
  }

  // Show character selection overlay when video is recorded
  if (showCharacterSelection && recordedVideoUrl) {
    return (
      <div className="relative flex h-full w-full items-start justify-center md:items-center">
        <div className="relative aspect-[9/16] w-full max-w-none overflow-hidden rounded-none bg-neutral-900 md:h-full md:max-h-[80vh] md:max-w-sm md:rounded-2xl">
          {/* Background video playing in loop */}
          <video
            src={recordedVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
          
          {/* Character selection UI */}
          <div className="absolute inset-0 flex flex-col">
            {/* Upload status indicator */}
            {isUploading && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm md:left-4 md:top-4">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                <span className="font-mono text-[11px] text-white">uploading...</span>
              </div>
            )}
            
            {/* Re-record button */}
            <button
              onClick={onReRecord}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 font-mono text-[11px] text-white backdrop-blur-sm transition-colors hover:bg-black/60 md:right-4 md:top-4"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              re-record
            </button>
            
            {/* Main content */}
            <div className="flex flex-1 flex-col justify-end p-4 pb-6 md:p-6">
              <div className="flex flex-col gap-4">
                <p className="font-mono text-[11px] lowercase text-neutral-400">
                  select character
                </p>
                
                {/* Character grid - horizontal scrollable on mobile, grid on desktop */}
                <div className="flex gap-2 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:gap-2 md:overflow-visible md:pb-0">
                  {allCharacters.map((char) => (
                    <button
                      key={char.id}
                      onClick={() => onSelectCharacter?.(char.id)}
                      className={`relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg transition-all md:w-auto ${
                        selectedCharacter === char.id 
                          ? "ring-2 ring-white" 
                          : "ring-1 ring-white/20 hover:ring-white/40"
                      }`}
                    >
                      <Image
                        src={char.src || "/placeholder.svg"}
                        alt={char.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </button>
                  ))}
                  
                  {/* Upload button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingCharacter}
                    className="flex aspect-[3/4] w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/30 transition-colors hover:border-white/50 md:w-auto"
                  >
                    {isUploadingCharacter ? (
                      <svg className="h-4 w-4 animate-spin text-white/50" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    )}
                  </button>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                {/* Generate button */}
                <button
                  onClick={onGenerate}
                  disabled={!selectedCharacter || isUploading}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-white font-sans text-[14px] font-semibold text-black transition-all hover:bg-neutral-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Uploading video...
                    </>
                  ) : (
                    "Generate"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full items-start justify-center md:items-center">
      <div className="relative aspect-[9/16] w-full max-w-none overflow-hidden rounded-none bg-neutral-900 md:h-full md:max-h-[80vh] md:max-w-sm md:rounded-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {/* Hidden canvas for mirrored recording */}
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Flash effect */}
        {showFlash && (
          <div className="absolute inset-0 z-50 bg-white animate-in fade-in duration-75" />
        )}

        {/* Tips overlay */}
        {showTips && hasPermission && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
            <div className="flex max-w-[280px] flex-col gap-3">
              <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                <span className="text-white">1.</span> Keep your head centered, avoid sudden movements
              </p>
              <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                <span className="text-white">2.</span> Good lighting on your face works best
              </p>
              <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                <span className="text-white">3.</span> Speak clearly - your audio will be preserved
              </p>
              <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                <span className="text-white">4.</span> Videos must be 3-30 seconds long
              </p>
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <span className="font-mono text-8xl font-bold text-white animate-in zoom-in duration-200">
              {countdown}
            </span>
          </div>
        )}

        {isRecording && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-sm md:left-4 md:top-4">
            <span className={`h-2 w-2 rounded-full ${recordingTime >= 24 ? "bg-amber-500" : "bg-red-500"} animate-pulse`} />
            <span className={`font-mono text-[11px] tabular-nums md:text-xs ${recordingTime >= 24 ? "text-amber-400" : "text-white"}`}>
              {recordingTime}/30s
            </span>
          </div>
        )}
        
        {/* Warning when approaching max time - show last 5 seconds */}
        {isRecording && recordingTime >= 24 && (
          <div className="absolute inset-x-0 top-14 flex justify-center md:top-16">
            <div className="animate-pulse rounded-lg bg-amber-500 px-4 py-2 shadow-lg">
              <span className="font-mono text-[13px] font-semibold text-black">
                {Math.max(1, 29 - recordingTime)}s left
              </span>
            </div>
          </div>
        )}

        {/* Record button - positioned above mobile bottom sheet (100px peek) */}
        <div className="absolute bottom-28 left-1/2 z-40 -translate-x-1/2 md:bottom-6">
          {/* OK button to dismiss tips */}
          {showTips && hasPermission && (
            <button
              onClick={() => setShowTips(false)}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white font-sans text-[15px] font-semibold text-black transition-all hover:scale-105 hover:bg-neutral-200 active:scale-95 md:h-[72px] md:w-[72px] md:text-[16px]"
            >
              OK
            </button>
          )}
          
          {!isRecording && !isProcessing && countdown === null && !showTips && (
            <button
              onClick={startRecording}
              className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white/90 bg-transparent transition-all hover:scale-105 active:scale-95 md:h-[72px] md:w-[72px]"
              aria-label="Start recording"
            >
              <span className="h-[52px] w-[52px] rounded-full bg-red-500 md:h-[58px] md:w-[58px]" />
            </button>
          )}

          {isRecording && (
            <button
              onClick={stopRecording}
              className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white/90 bg-transparent transition-all hover:scale-105 active:scale-95 md:h-[72px] md:w-[72px]"
              aria-label="Stop recording"
            >
              <span className="h-6 w-6 rounded-[4px] bg-white md:h-7 md:w-7" />
            </button>
          )}

          {isProcessing && !progress && (
            <div className="flex h-16 w-16 items-center justify-center md:h-[72px] md:w-[72px]">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-white md:h-9 md:w-9" />
            </div>
          )}
        </div>

  {/* Progress overlay */}
  {isProcessing && progress !== undefined && (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
  <div className="flex w-full max-w-[200px] flex-col items-center gap-4 px-6">
  {isError ? (
    <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ) : null}
  <p className={`font-sans text-[15px] font-medium ${isError ? "text-red-400" : "text-white"}`}>
  {progressMessage || "Generating..."}
  </p>
  
  {/* Progress bar */}
  {!isError && (
  <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
  <div
  className="h-full rounded-full bg-white transition-all duration-500 ease-out"
  style={{ width: `${Math.round(progress)}%` }}
  />
              </div>
              )}
              {/* Percentage */}
              {!isError && (
              <p className="font-mono text-[13px] tabular-nums text-neutral-400">
                {Math.round(progress)}%
              </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
