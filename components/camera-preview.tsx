"use client"

import { useRef, useState, useCallback, useEffect } from "react"

interface CameraPreviewProps {
  onVideoRecorded: (videoBlob: Blob, aspectRatio: "9:16" | "16:9" | "fill") => void
  isProcessing: boolean
  progress?: number
  progressMessage?: string
  isError?: boolean
}

export function CameraPreview({ onVideoRecorded, isProcessing, progress, progressMessage, isError }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
  // Always use fill aspect ratio
  const aspectRatio = "fill" as const
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const isStartingRef = useRef(false)

  const startCamera = useCallback(async () => {
    try {
      // Stop existing stream if any
      if (originalStreamRef.current) {
        originalStreamRef.current.getTracks().forEach(track => track.stop())
      }
      
      // Always request 16:9 as base (most webcams are 16:9) in fill mode
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user", 
          width: 1280, 
          height: 720, 
        },
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

    // Detect browser
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    
    // Choose stream source:
    // - Safari: Use original camera stream (not canvas) to get proper metadata
    //   Trade-off: Video won't be mirrored, but fal.ai will accept it
    // - Chrome/Firefox: Use canvas stream for mirrored video
    let recordingStream: MediaStream
    
    if (isSafari) {
      // Safari: Record directly from camera (proper metadata, but not mirrored)
      recordingStream = originalStreamRef.current
      console.log("[v0] Safari detected - using direct camera stream (video won't be mirrored)")
    } else {
      // Chrome/Firefox: Use canvas stream (mirrored video)
      const canvasStream = canvas.captureStream(30)
      const audioTracks = originalStreamRef.current.getAudioTracks()
      audioTracks.forEach(track => canvasStream.addTrack(track))
      recordingStream = canvasStream
      console.log("[v0] Chrome/Firefox - using canvas stream (mirrored video)")
    }

    chunksRef.current = []
    
    let mediaRecorder: MediaRecorder
    let mimeType: string
    
    if (isSafari) {
      // Safari: Use MP4 which has better metadata support
      mimeType = "video/mp4"
      mediaRecorder = new MediaRecorder(recordingStream, { 
        mimeType,
        videoBitsPerSecond: 5000000,
      })
    } else {
      // Chrome/Firefox: Use WebM with VP8
      mimeType = "video/webm;codecs=vp8,opus"
      mediaRecorder = new MediaRecorder(recordingStream, { 
        mimeType,
        videoBitsPerSecond: 5000000,
      })
    }
    
    console.log("[v0] MediaRecorder config:", { mimeType, isSafari })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    mediaRecorder.onstop = () => {
      // Stop canvas drawing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      
      // Use base mimeType without codecs
      const blobMimeType = mimeType.split(";")[0]
      const blob = new Blob(chunksRef.current, { type: blobMimeType })
      console.log("[v0] Recording stopped:", { 
        chunks: chunksRef.current.length, 
        size: (blob.size / 1024 / 1024).toFixed(2) + " MB",
        type: blob.type 
      })
      
      onVideoRecorded(blob, aspectRatio)
    }

    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start()
    console.log("[v0] Recording started")
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
  }, [onVideoRecorded, aspectRatio])

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

  // Minimum recording duration required by fal.ai (2 seconds of continuous motion)
  const MIN_RECORDING_SECONDS = 3
  
  const stopRecording = useCallback(() => {
    // Prevent stopping too early - fal.ai requires at least 2s of continuous motion
    if (recordingTime < MIN_RECORDING_SECONDS) {
      return // Don't stop, need more recording time
    }
    
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
  }, [recordingTime])

  if (hasPermission === false) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Camera access denied</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full">


      <div className="relative h-full w-full overflow-hidden bg-neutral-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain md:object-cover"
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
            <div className="flex max-w-[280px] flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <p className="font-mono text-[12px] text-neutral-400">
                  Using{" "}
                  <span className="text-white">Kling AI Motion Control</span>
                </p>
                <p className="font-mono text-[12px] text-neutral-400">
                  via{" "}
                  <a 
                    href="https://vercel.com/ai-gateway" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white underline underline-offset-2 hover:text-neutral-300"
                  >
                    AI Gateway
                  </a>
                </p>
              </div>
              
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-500">
                  For best results
                </p>
                <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                  <span className="text-white">1.</span> <span className="font-semibold text-white">Show head + upper body</span> clearly
                </p>
                <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                  <span className="text-white">2.</span> <span className="font-semibold text-white">Keep moving</span> — talk, gesture, turn head
                </p>
                <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                  <span className="text-white">3.</span> Good lighting on your face
                </p>
                <p className="font-mono text-[13px] leading-relaxed text-neutral-300">
                  <span className="text-white">4.</span> Record <span className="font-semibold text-white">3-30 seconds</span>
                </p>
              </div>
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
        
        {/* Minimum duration indicator - show for first 3 seconds */}
        {isRecording && recordingTime < 3 && (
          <div className="absolute inset-x-0 top-14 flex justify-center md:top-16">
            <div className="rounded-lg bg-neutral-800 px-4 py-2 shadow-lg">
              <span className="font-mono text-[13px] text-neutral-300">
                Min. <span className="font-semibold text-white">{3 - recordingTime}s</span> more
              </span>
            </div>
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
              disabled={recordingTime < 3}
              className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] transition-all md:h-[72px] md:w-[72px] ${
                recordingTime < 3 
                  ? "cursor-not-allowed border-neutral-600 opacity-50" 
                  : "border-white/90 bg-transparent hover:scale-105 active:scale-95"
              }`}
              aria-label={recordingTime < 3 ? `Recording minimum ${3 - recordingTime}s more` : "Stop recording"}
            >
              <span className={`h-6 w-6 rounded-[4px] md:h-7 md:w-7 ${recordingTime < 3 ? "bg-neutral-500" : "bg-white"}`} />
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
