"use client"

import { useState, useCallback } from "react"

interface ProcessingProgress {
  stage: "loading" | "processing" | "done" | "error"
  percent: number
  message: string
}

interface UseVideoProcessorReturn {
  processVideo: (inputBlob: Blob) => Promise<Blob>
  progress: ProcessingProgress | null
  isProcessing: boolean
}

/**
 * Detect if the browser is Chrome (or Chromium-based)
 * Chrome outputs WebM which fal.ai can handle directly
 */
function isChromeBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return ua.includes("Chrome") && !ua.includes("Edg")
}

/**
 * Hook to process video using MediaBunny (lightweight WebCodecs-based converter)
 * This fixes Safari MP4 metadata issues by re-muxing with fastStart enabled
 * Chrome is skipped since it outputs WebM which fal.ai handles directly
 */
export function useVideoProcessor(): UseVideoProcessorReturn {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const processVideo = useCallback(async (inputBlob: Blob): Promise<Blob> => {
    // Skip processing for Chrome - outputs WebM which fal.ai handles fine
    if (isChromeBrowser()) {
      console.log("[v0] Chrome detected, skipping video processing")
      setProgress({ stage: "done", percent: 100, message: "Ready!" })
      return inputBlob
    }

    setIsProcessing(true)
    setProgress({ stage: "loading", percent: 0, message: "Loading processor..." })

    try {
      // Dynamically import mediabunny
      const { 
        Input, 
        Output, 
        Conversion, 
        ALL_FORMATS, 
        BlobSource, 
        Mp4OutputFormat, 
        BufferTarget 
      } = await import("mediabunny")

      setProgress({ stage: "processing", percent: 20, message: "Preparing video..." })

      // Create input from blob
      const input = new Input({
        source: new BlobSource(inputBlob),
        formats: ALL_FORMATS,
      })

      // Create output with MP4 format and fastStart enabled (moves moov atom to beginning)
      const target = new BufferTarget()
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target,
      })

      setProgress({ stage: "processing", percent: 40, message: "Converting video..." })

      // Initialize and execute conversion
      const conversion = await Conversion.init({
        input,
        output,
        video: {
          codec: "avc", // H.264 for maximum compatibility
        },
        audio: {
          codec: "aac",
        },
      })

      // Listen for progress
      conversion.on("progress", (p: number) => {
        const percent = Math.round(40 + p * 50) // 40-90%
        setProgress({ stage: "processing", percent, message: "Converting video..." })
      })

      await conversion.execute()

      setProgress({ stage: "processing", percent: 95, message: "Finalizing..." })

      // Get the output buffer
      const outputBlob = new Blob([target.buffer], { type: "video/mp4" })

      setProgress({ stage: "done", percent: 100, message: "Done!" })
      setIsProcessing(false)

      console.log("[v0] Video processed with MediaBunny:", 
        (inputBlob.size / 1024 / 1024).toFixed(2), "MB ->", 
        (outputBlob.size / 1024 / 1024).toFixed(2), "MB"
      )

      return outputBlob
    } catch (error) {
      console.error("[v0] MediaBunny processing error:", error)
      setProgress({ 
        stage: "error", 
        percent: 0, 
        message: error instanceof Error ? error.message : "Processing failed" 
      })
      setIsProcessing(false)
      
      // Return original blob if processing fails - let fal.ai try to handle it
      console.log("[v0] Falling back to original video")
      return inputBlob
    }
  }, [])

  return {
    processVideo,
    progress,
    isProcessing,
  }
}
