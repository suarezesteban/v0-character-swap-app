"use client"

import React, { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Generation {
  id: number
  video_url: string | null
  character_name: string | null
  character_image_url: string | null
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  created_at: string
  completed_at: string | null
  error_message: string | null
}

interface FailedGenerationProps {
  gen: Generation
  onDelete: (e: React.MouseEvent) => void
}

// Map technical errors to user-friendly messages
function getUserFriendlyError(errorMessage: string | null): string {
  if (!errorMessage) return "Something went wrong. Please try again."
  
  // Motion/movement related errors - fal.ai requires 2+ seconds of continuous motion
  if (errorMessage.toLowerCase().includes("motion") || errorMessage.toLowerCase().includes("continuous")) {
    return "Video needs at least 2 seconds of continuous movement. Try recording for 3+ seconds while moving your head or body steadily."
  }
  
  // Duration errors
  if (errorMessage.toLowerCase().includes("duration") || errorMessage.toLowerCase().includes("short") || errorMessage.toLowerCase().includes("2 second")) {
    return "Video too short. Record for at least 3 seconds with continuous movement."
  }
  
  // Face detection errors
  if (errorMessage.toLowerCase().includes("face") || errorMessage.toLowerCase().includes("detect")) {
    return "Make sure your face is clearly visible and well-lit in the video."
  }
  
  // Quality errors
  if (errorMessage.toLowerCase().includes("quality") || errorMessage.toLowerCase().includes("resolution")) {
    return "Try recording in better lighting conditions."
  }
  
  // Default: show original but cleaned up
  return errorMessage.replace(/^The input was rejected,?\s*/i, "").trim() || "Something went wrong. Please try again."
}

export function FailedGeneration({ gen, onDelete }: FailedGenerationProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const friendlyError = gen.status === "cancelled" 
    ? "Cancelled by user" 
    : getUserFriendlyError(gen.error_message)
  const shortMessage = gen.status === "cancelled" 
    ? "Cancelled" 
    : "Failed"

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="group relative flex h-full w-full flex-col items-center justify-center gap-1 p-1">
          {/* Delete button in corner */}
          <div
            onClick={(e) => {
              e.stopPropagation()
              onDelete(e)
            }}
            className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 opacity-0 shadow-md ring-1 ring-neutral-700 transition-all hover:bg-neutral-700 hover:text-white group-hover:opacity-100"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          
          <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-center font-sans text-[8px] leading-tight text-neutral-400">
            {shortMessage}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="center"
        className="w-72 border-neutral-800 bg-neutral-900 p-0"
      >
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-sans text-sm font-medium text-red-400">
              {gen.status === "cancelled" ? "Cancelled" : "Generation Failed"}
            </span>
          </div>
          <p className="mb-3 font-sans text-xs leading-relaxed text-neutral-300">
            {friendlyError}
          </p>
          <button
            onClick={(e) => {
              setIsOpen(false)
              onDelete(e)
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 font-sans text-xs text-red-400 transition-colors hover:bg-red-500/20"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
