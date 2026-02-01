"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { upload } from "@vercel/blob/client"
import { MAX_VIDEO_SIZE, MAX_VIDEO_DURATION, STORAGE_KEYS } from "@/lib/constants"
import { useVideoProcessor } from "./use-video-processor"

interface UseVideoRecordingReturn {
  recordedVideo: Blob | null
  recordedVideoUrl: string | null
  uploadedVideoUrl: string | null
  recordedAspectRatio: "9:16" | "16:9" | "fill"
  isUploading: boolean
  isProcessing: boolean
  processingProgress: { stage: string; percent: number; message: string } | null
  showPreview: boolean
  setShowPreview: (show: boolean) => void
  handleVideoRecorded: (blob: Blob, aspectRatio: "9:16" | "16:9" | "fill") => void
  clearRecording: () => void
  restoreFromSession: () => Promise<{ shouldAutoSubmit: boolean }>
  saveToSession: (video: Blob, characterId: number | null) => Promise<void>
}

export function useVideoRecording(): UseVideoRecordingReturn {
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null)
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null)
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null)
  const [recordedAspectRatio, setRecordedAspectRatio] = useState<"9:16" | "16:9" | "fill">("fill")
  const [isUploading, setIsUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  
  // Video processor for client-side transcoding
  const { processVideo, progress: processingProgress, isProcessing } = useVideoProcessor()
  const processingRef = useRef(false)

  // Create object URL when video changes
  useEffect(() => {
    if (recordedVideo) {
      const url = URL.createObjectURL(recordedVideo)
      setRecordedVideoUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setRecordedVideoUrl(null)
    }
  }, [recordedVideo])

  // Upload video to Vercel Blob
  // Now we process the video client-side with ffmpeg.wasm before uploading
  const uploadVideo = useCallback(async (blob: Blob) => {
    // Prevent duplicate processing
    if (processingRef.current) {
      console.log("[v0] Already processing, skipping duplicate call")
      return
    }
    processingRef.current = true
    
    setIsUploading(true)
    try {
      // Process video with ffmpeg.wasm to fix metadata and ensure compatibility
      console.log("[v0] Processing video with ffmpeg.wasm - input type:", blob.type, "size:", blob.size)
      const processedBlob = await processVideo(blob)
      console.log("[v0] Video processed - output type:", processedBlob.type, "size:", processedBlob.size)
      
      // Upload the processed MP4 to Vercel Blob
      console.log("[v0] Uploading processed video to Vercel Blob")
      
      const videoBlob = await upload(`videos/${Date.now()}-recording.mp4`, processedBlob, {
        access: "public",
        handleUploadUrl: "/api/upload",
      })
      console.log("[v0] Video uploaded successfully:", videoBlob.url)
      setUploadedVideoUrl(videoBlob.url)
    } catch (error) {
      console.error("[v0] Failed to process/upload video:", error)
      // Don't fail - user can still generate, it will upload then
    } finally {
      setIsUploading(false)
      processingRef.current = false
    }
  }, [processVideo])

  const handleVideoRecorded = useCallback((blob: Blob, _aspectRatio: "9:16" | "16:9" | "fill") => {
    // Validate file size
    if (blob.size > MAX_VIDEO_SIZE) {
      alert("Video is too large. Please record a shorter video (max 50MB).")
      return
    }

    // Create a video element to check duration and detect actual aspect ratio
    const video = document.createElement("video")
    video.preload = "metadata"
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      
      // WebM from canvas.captureStream often reports Infinity or NaN duration
      // Only reject if we have a valid duration that's clearly too long
      const duration = video.duration
      const hasValidDuration = isFinite(duration) && !isNaN(duration) && duration > 0
      
      if (hasValidDuration && duration > MAX_VIDEO_DURATION + 1) {
        const durationSeconds = Math.round(duration)
        alert(`Video is too long (${durationSeconds}s). Please record up to ${MAX_VIDEO_DURATION} seconds.`)
        return
      }
      
      console.log("[v0] Video metadata loaded - duration:", duration, "hasValidDuration:", hasValidDuration)
      
      // Detect actual aspect ratio from video dimensions
      const { videoWidth, videoHeight } = video
      const ratio = videoWidth / videoHeight
      let detectedAspectRatio: "9:16" | "16:9" | "fill" = "fill"
      
      if (ratio < 0.7) {
        // Portrait (9:16 is ~0.5625)
        detectedAspectRatio = "9:16"
      } else if (ratio > 1.4) {
        // Landscape (16:9 is ~1.777)
        detectedAspectRatio = "16:9"
      } else {
        // Square-ish or other - treat as fill
        detectedAspectRatio = "fill"
      }
      
      setRecordedVideo(blob)
      setRecordedAspectRatio(detectedAspectRatio)
      setShowPreview(true)
      // Start converting and uploading immediately in background
      uploadVideo(blob)
    }
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      console.log("[v0] Video metadata error - accepting video anyway")
      // Still accept the video if we can't validate duration
      setRecordedVideo(blob)
      setRecordedAspectRatio("fill") // Default to fill if can't detect
      setShowPreview(true)
      uploadVideo(blob)
    }
    
    video.src = URL.createObjectURL(blob)
  }, [uploadVideo])

  const clearRecording = useCallback(() => {
    setRecordedVideo(null)
    setRecordedVideoUrl(null)
    setUploadedVideoUrl(null)
    setRecordedAspectRatio("fill")
    setShowPreview(false)
  }, [])

  const saveToSession = useCallback(async (video: Blob, characterId: number | null) => {
    if (characterId) {
      sessionStorage.setItem(STORAGE_KEYS.PENDING_CHARACTER, String(characterId))
    }
    // Save aspect ratio
    sessionStorage.setItem(STORAGE_KEYS.PENDING_ASPECT_RATIO, recordedAspectRatio)
    // Save uploaded URL if available, otherwise save blob as data URL
    if (uploadedVideoUrl) {
      sessionStorage.setItem(STORAGE_KEYS.PENDING_VIDEO_URL, uploadedVideoUrl)
      sessionStorage.setItem(STORAGE_KEYS.PENDING_UPLOADED, "true")
    } else {
      try {
        const dataUrl = await blobToDataUrl(video)
        sessionStorage.setItem(STORAGE_KEYS.PENDING_VIDEO_URL, dataUrl)
        sessionStorage.setItem(STORAGE_KEYS.PENDING_UPLOADED, "false")
      } catch (e) {
        console.error("Failed to save video:", e)
      }
    }
    sessionStorage.setItem(STORAGE_KEYS.PENDING_AUTO_SUBMIT, "true")
  }, [uploadedVideoUrl, recordedAspectRatio])

  const restoreFromSession = useCallback(async (): Promise<{ shouldAutoSubmit: boolean }> => {
    const savedVideoUrl = sessionStorage.getItem(STORAGE_KEYS.PENDING_VIDEO_URL)
    const wasUploaded = sessionStorage.getItem(STORAGE_KEYS.PENDING_UPLOADED) === "true"
    const shouldAutoSubmit = sessionStorage.getItem(STORAGE_KEYS.PENDING_AUTO_SUBMIT) === "true"
    const savedAspectRatio = sessionStorage.getItem(STORAGE_KEYS.PENDING_ASPECT_RATIO) as "9:16" | "16:9" | "fill" | null
    
    if (savedVideoUrl) {
      try {
        if (wasUploaded) {
          // It's already uploaded to blob storage
          setUploadedVideoUrl(savedVideoUrl)
          // We need to fetch it to create a local blob for preview
          const response = await fetch(savedVideoUrl)
          const blob = await response.blob()
          setRecordedVideo(blob)
        } else {
          // It's a data URL, convert back to blob
          const response = await fetch(savedVideoUrl)
          const blob = await response.blob()
          setRecordedVideo(blob)
          // Re-upload in background
          uploadVideo(blob)
        }
        // Restore aspect ratio
        if (savedAspectRatio) {
          setRecordedAspectRatio(savedAspectRatio)
        }
        setShowPreview(true)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_VIDEO_URL)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_UPLOADED)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_AUTO_SUBMIT)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_ASPECT_RATIO)
        return { shouldAutoSubmit }
      } catch {
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_VIDEO_URL)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_UPLOADED)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_AUTO_SUBMIT)
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_ASPECT_RATIO)
      }
    }
    return { shouldAutoSubmit: false }
  }, [uploadVideo])

  return {
    recordedVideo,
    recordedVideoUrl,
    uploadedVideoUrl,
    recordedAspectRatio,
    isUploading,
    isProcessing,
    processingProgress,
    showPreview,
    setShowPreview,
    handleVideoRecorded,
    clearRecording,
    restoreFromSession,
    saveToSession,
  }
}

// Helper function
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
