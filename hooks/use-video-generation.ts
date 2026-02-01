"use client"

import { useCallback, useRef } from "react"
import { upload } from "@vercel/blob/client"
import type { Character, User } from "@/lib/types"
import { MIN_IMAGE_DIMENSION } from "@/lib/constants"

interface UseVideoGenerationOptions {
  user: User | null
  onLoginRequired: () => void
  onSuccess: () => void
  onError: (message: string) => void
}

interface UseVideoGenerationReturn {
  processVideo: (video: Blob, character: Character, sendEmail: boolean, preUploadedVideoUrl?: string | null) => void
}

// Helper to validate image dimensions
async function validateImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}

export function useVideoGeneration({
  user,
  onLoginRequired,
  onSuccess,
  onError,
}: UseVideoGenerationOptions): UseVideoGenerationReturn {
  const processingRef = useRef(false)

  const processVideo = useCallback((
    video: Blob,
    character: Character,
    sendEmail: boolean,
    preUploadedVideoUrl?: string | null,
    aspectRatio: "9:16" | "16:9" | "fill" = "fill",
    sourceVideoAspectRatio: "9:16" | "16:9" | "fill" = "fill"
  ) => {
    if (!user) {
      onLoginRequired()
      return
    }

    // Prevent double-submit
    if (processingRef.current) return
    processingRef.current = true

    // Run everything in background - don't await
    ;(async () => {
      let generationId: number | null = null
      
      try {
        // Quick validation first
        try {
          const dimensions = await validateImageDimensions(character.src)
          if (dimensions.width < MIN_IMAGE_DIMENSION || dimensions.height < MIN_IMAGE_DIMENSION) {
            throw new Error(
              `Character image is too small (${dimensions.width}x${dimensions.height}). ` +
              `Minimum size is ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION} pixels.`
            )
          }
        } catch (dimError) {
          if (dimError instanceof Error && dimError.message.includes("too small")) {
            throw dimError
          }
        }

        // 1. Create pending generation in DB immediately
        const pendingResponse = await fetch("/api/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterName: character.name,
            characterImageUrl: character.src,
            aspectRatio,
            sourceVideoAspectRatio,
          }),
        })
        
        if (!pendingResponse.ok) {
          throw new Error("Failed to create generation")
        }
        
        const { generationId: id } = await pendingResponse.json()
        generationId = id

        // 2. Trigger refresh so it appears in "My Videos" immediately
        window.dispatchEvent(new CustomEvent("refresh-generations"))

        // 3. Upload video (skip if already uploaded)
        let videoUrl = preUploadedVideoUrl
        if (!videoUrl) {
          const videoBlob = await upload(`videos/${Date.now()}-recording.webm`, video, {
            access: "public",
            handleUploadUrl: "/api/upload",
          })
          videoUrl = videoBlob.url
        }

        // 4. Upload character image
        const characterResponse = await fetch(character.src)
        const characterBlob = await characterResponse.blob()

        const characterBlobResult = await upload(`characters/${Date.now()}-character.jpg`, characterBlob, {
          access: "public",
          handleUploadUrl: "/api/upload",
        })

        // 5. Start actual generation
        const startResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationId,
            videoUrl,
            characterImageUrl: characterBlobResult.url,
            userId: user.id,
            userEmail: user.email,
            characterName: character.name,
            sendEmail: sendEmail && user.email ? true : false,
          }),
        })

        if (!startResponse.ok) {
          const errorData = await startResponse.json()
          throw new Error(errorData.error || "Failed to start generation")
        }

        // Refresh to show "processing" status
        window.dispatchEvent(new CustomEvent("refresh-generations"))
        
      } catch (error) {
        console.error("Background processing failed:", error)
        const errorMessage = error instanceof Error ? error.message : "Something went wrong"
        
        // If we created a generation, mark it as failed
        if (generationId) {
          try {
            await fetch(`/api/generations/${generationId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "failed", errorMessage }),
            })
            window.dispatchEvent(new CustomEvent("refresh-generations"))
          } catch {
            // Ignore cleanup errors
          }
        }
        
        onError(errorMessage)
      } finally {
        processingRef.current = false
      }
    })()

    // Return immediately - don't wait for the async work
    onSuccess()
  }, [user, onLoginRequired, onSuccess, onError])

  return {
    processVideo,
  }
}
