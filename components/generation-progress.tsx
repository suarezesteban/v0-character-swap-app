"use client"

import { useState, useEffect } from "react"
import Image from "next/image"

interface GenerationProgressProps {
  characterImageUrl?: string | null
  createdAt: string
  status: "uploading" | "pending" | "processing"
  onCancel?: (e?: React.MouseEvent) => void
}

// Estimated time in seconds (~7 min based on real usage data)
const ESTIMATED_DURATION = 7 * 60
// Max display time - after this, something might be wrong
const MAX_DISPLAY_TIME = 12 * 60

export function GenerationProgress({ 
  characterImageUrl, 
  createdAt, 
  status,
  onCancel 
}: GenerationProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    const startTime = new Date(createdAt).getTime()
    
    const updateElapsed = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      setElapsedSeconds(elapsed)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    
    return () => clearInterval(interval)
  }, [createdAt])

  const progress = Math.min(100, (elapsedSeconds / ESTIMATED_DURATION) * 100)
  
  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Status-specific messages (adjusted for ~7 min total duration)
  const getStatusMessage = () => {
    if (status === "uploading") return "Uploading video..."
    if (status === "pending") return "In queue..."
    if (elapsedSeconds < 30) return "Starting AI model..."
    if (elapsedSeconds < 120) return "Analyzing motion..."
    if (elapsedSeconds < 240) return "Processing frames..."
    if (elapsedSeconds < 360) return "Generating video..."
    if (elapsedSeconds < 420) return "Rendering final..."
    if (elapsedSeconds < MAX_DISPLAY_TIME) return "Almost done..."
    return "Taking longer than usual..."
  }

  const remainingSeconds = Math.max(0, ESTIMATED_DURATION - elapsedSeconds)

  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden">
      {/* Background character image */}
      {characterImageUrl && (
        <Image
          src={characterImageUrl}
          alt=""
          fill
          className="object-cover opacity-20"
          sizes="56px"
        />
      )}
      
      {/* Clickable area to show cancel confirmation */}
      <button
        onClick={() => setShowCancelConfirm(true)}
        className="relative z-10 flex h-full w-full flex-col items-center justify-center p-0.5"
      >
        {/* Circular progress indicator - smaller on mobile */}
        <div className="relative h-8 w-8 md:h-10 md:w-10">
          <svg className="h-8 w-8 -rotate-90 md:h-10 md:w-10" viewBox="0 0 36 36">
            {/* Background circle */}
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-neutral-800"
            />
            {/* Progress circle */}
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${progress * 0.94} 94`}
              className="text-white transition-all duration-1000"
            />
          </svg>
          {/* Percentage in center */}
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-semibold text-white md:text-[9px]">
            {Math.round(progress)}%
          </span>
        </div>
      </button>

      {/* Cancel confirmation overlay */}
      {showCancelConfirm && onCancel && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/90 p-2">
          <p className="text-center font-mono text-[8px] text-neutral-400">
            {getStatusMessage()}
          </p>
          <p className="font-mono text-[10px] text-white">
            ~{formatTime(remainingSeconds)} left
          </p>
          <div className="mt-1 flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowCancelConfirm(false)
              }}
              className="rounded bg-neutral-700 px-2 py-0.5 font-mono text-[8px] text-white transition-colors hover:bg-neutral-600"
            >
              Back
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCancel(e)
              }}
              className="rounded bg-neutral-600 px-2 py-0.5 font-mono text-[8px] text-white transition-colors hover:bg-neutral-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Expanded version for larger displays
export function GenerationProgressExpanded({ 
  characterImageUrl, 
  characterName,
  createdAt, 
  status,
  onCancel 
}: GenerationProgressProps & { characterName?: string | null }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    const startTime = new Date(createdAt).getTime()
    
    const updateElapsed = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      setElapsedSeconds(elapsed)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    
    return () => clearInterval(interval)
  }, [createdAt])

  const remainingSeconds = Math.max(0, ESTIMATED_DURATION - elapsedSeconds)
  const progress = Math.min(100, (elapsedSeconds / ESTIMATED_DURATION) * 100)
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getStatusMessage = () => {
    if (status === "uploading") return "Uploading video..."
    if (status === "pending") return "In queue..."
    if (elapsedSeconds < 30) return "Starting AI model..."
    if (elapsedSeconds < 120) return "Analyzing motion..."
    if (elapsedSeconds < 240) return "Processing frames..."
    if (elapsedSeconds < 360) return "Generating video..."
    if (elapsedSeconds < 420) return "Rendering final..."
    return "Almost done..."
  }

  return (
    <div className="rounded-lg bg-neutral-900 p-4 ring-1 ring-neutral-800">
      <div className="flex items-start gap-4">
        {/* Character thumbnail */}
        {characterImageUrl && (
          <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={characterImageUrl}
              alt={characterName || ""}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
        )}
        
        <div className="flex-1">
          {/* Status message */}
          <p className="mb-2 font-sans text-[13px] font-medium text-white">
            {getStatusMessage()}
          </p>
          
          {/* Progress bar */}
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div 
              className="h-full rounded-full bg-white transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Time info */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-neutral-500">
              {characterName || "Generating"}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-neutral-400">
              {remainingSeconds > 0 ? `~${formatTime(remainingSeconds)} remaining` : "Almost done..."}
            </span>
          </div>
        </div>
      </div>
      
      {/* Cancel button */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-3 w-full rounded-lg bg-neutral-800 px-3 py-2 font-sans text-[12px] text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
        >
          Cancel Generation
        </button>
      )}
    </div>
  )
}
