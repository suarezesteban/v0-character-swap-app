"use client"

import React, { useEffect } from "react"
import Image from "next/image"
import useSWR from "swr"
import { FailedGeneration } from "@/components/failed-generation"
import { GenerationProgress } from "@/components/generation-progress"
import { useAuth } from "@/components/auth-provider"

interface Generation {
  id: number
  video_url: string | null
  character_name: string | null
  character_image_url: string | null
  status: "uploading" | "pending" | "processing" | "completed" | "failed" | "cancelled"
  created_at: string
  completed_at: string | null
  error_message: string | null
}

interface GenerationsPanelProps {
  onSelectVideo?: (videoUrl: string) => void
  className?: string
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function GenerationsPanel({ onSelectVideo, className = "" }: GenerationsPanelProps) {
  const { user } = useAuth()
  
  const { data, isLoading, mutate } = useSWR(
    user?.id ? "/api/generations" : null,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  )
  
  const generations: Generation[] = data?.generations || []
  const hasPending = generations.some(g => g.status === "uploading" || g.status === "pending" || g.status === "processing")

  // Poll only when there are pending generations
  useSWR(
    user?.id && hasPending ? "/api/generations" : null,
    fetcher,
    {
      refreshInterval: 10000,
      dedupingInterval: 5000,
    }
  )

  // Listen for refresh events from the generate action
  useEffect(() => {
    const handleRefresh = () => mutate()
    window.addEventListener("refresh-generations", handleRefresh)
    return () => window.removeEventListener("refresh-generations", handleRefresh)
  }, [mutate])

  // Delete/Cancel a generation
  const handleDelete = async (generationId: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const response = await fetch(`/api/generations/${generationId}`, {
        method: "DELETE",
      })
      if (response.ok) {
        mutate()
      }
    } catch (error) {
      console.error("Failed to delete generation:", error)
    }
  }

  // Show sign in prompt if user is not logged in
  if (!user) {
    return (
      <div className={className}>
        <p className="mb-2 font-mono text-[11px] lowercase text-neutral-500">
          my videos
        </p>
        <p className="font-mono text-[11px] text-neutral-600">
          sign in to see your videos
        </p>
      </div>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <p className="font-mono text-[11px] lowercase text-neutral-500">
          my videos
        </p>
        <div className="mt-2 flex items-center justify-center py-4">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
        </div>
      </div>
    )
  }

  // Show empty state with helpful message
  if (generations.length === 0) {
    return (
      <div className={className}>
        <p className="mb-2 font-mono text-[11px] lowercase text-neutral-500">
          my videos
        </p>
        <p className="font-mono text-[11px] text-neutral-600">
          your generated videos will appear here
        </p>
      </div>
    )
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className={className}>
      <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        My Videos
      </p>
      
      <div className="flex gap-2 overflow-x-auto pb-2">
        {generations.filter(g => g.status !== "cancelled").map((gen) => (
          <div
            key={gen.id}
            className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-neutral-800"
          >
            {/* Thumbnail or status indicator */}
            {gen.status === "completed" && gen.video_url ? (
              <button
                onClick={() => onSelectVideo?.(gen.video_url!)}
                className="group relative h-full w-full"
              >
                <video
                  src={gen.video_url}
                  className="h-full w-full object-contain"
                  muted
                  playsInline
                  preload="none"
                  poster={gen.character_image_url || undefined}
                  onMouseEnter={(e) => e.currentTarget.play()}
                  onMouseLeave={(e) => {
                    e.currentTarget.pause()
                    e.currentTarget.currentTime = 0
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </button>
            ) : gen.status === "failed" || gen.status === "cancelled" ? (
              <FailedGeneration 
                gen={gen} 
                onDelete={(e) => handleDelete(gen.id, e)} 
              />
            ) : (
              // Processing/Pending state with progress indicator
              <GenerationProgress
                characterImageUrl={gen.character_image_url}
                createdAt={gen.created_at}
                status={gen.status as "uploading" | "pending" | "processing"}
                onCancel={(e) => handleDelete(gen.id, e)}
              />
            )}
            
            {/* Time indicator */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
              <span className="font-mono text-[8px] text-neutral-400">
                {formatTime(gen.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
