"use client"

import { useState, useEffect } from "react"
import Image from "next/image"

interface GenerationProgressProps {
  characterImageUrl?: string | null
  createdAt: string
  status: "uploading" | "pending" | "processing"
  onCancel?: (e?: React.MouseEvent) => void
}

// Estimated time in seconds (5 minutes)
const ESTIMATED_DURATION = 5 * 60

export function GenerationProgress({ 
  characterImageUrl, 
  createdAt, 
  status,
  onCancel 
}: GenerationProgressProps) {
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
  
  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Status-specific messages
  const getStatusMessage = () => {
    if (status === "uploading") return "Uploading video..."
    if (status === "pending") return "In queue..."
    if (elapsedSeconds < 30) return "Starting AI model..."
    if (elapsedSeconds < 120) return "Analyzing video..."
    if (elapsedSeconds < 240) return "Generating frames..."
    return "Finalizing..."
  }

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
      
      {/* Progress content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center p-1">
        {/* Circular progress indicator */}
        <div className="relative h-8 w-8">
          <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
            {/* Background circle */}
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-neutral-800"
            />
            {/* Progress circle */}
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${progress * 0.94} 94`}
              className="text-white transition-all duration-1000"
            />
          </svg>
          {/* Percentage in center */}
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[7px] font-medium text-white">
            {Math.round(progress)}%
          </span>
        </div>
        
        {/* Time remaining */}
        <div className="mt-1 text-center">
          <span className="font-mono text-[8px] tabular-nums text-neutral-300">
            {remainingSeconds > 0 ? formatTime(remainingSeconds) : "Almost done"}
          </span>
        </div>
      </div>

      {/* Cancel button on hover */}
      {onCancel && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCancel(e)
          }}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 opacity-0 transition-opacity group-hover:opacity-100"
          title="Cancel"
        >
          <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
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
    if (elapsedSeconds < 120) return "Analyzing video..."
    if (elapsedSeconds < 240) return "Generating frames..."
    return "Finalizing..."
  }

  return (
    <div className="rounded-xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
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
