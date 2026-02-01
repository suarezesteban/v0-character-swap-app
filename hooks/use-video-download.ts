"use client"

import { useState, useCallback } from "react"
import { createPipVideoClient, downloadBlob } from "@/lib/video-pip-client"

interface UseVideoDownloadOptions {
  resultUrl: string | null
  pipVideoUrl: string | null
  showPip: boolean
  pipAspectRatio: "9:16" | "16:9" | "fill"
}

interface UseVideoDownloadReturn {
  isDownloading: boolean
  downloadProgress: number
  handleDownload: () => Promise<void>
}

export function useVideoDownload({
  resultUrl,
  pipVideoUrl,
  showPip,
  pipAspectRatio,
}: UseVideoDownloadOptions): UseVideoDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const handleDownload = useCallback(async () => {
    if (!resultUrl) return

    // If we have a PiP source and PiP is enabled, create video with PiP overlay
    if (showPip && pipVideoUrl) {
      try {
        setIsDownloading(true)
        setDownloadProgress(0)

        const pipBlob = await createPipVideoClient({
          mainVideoUrl: resultUrl,
          pipVideoUrl: pipVideoUrl,
          pipPosition: "bottom-right",
          pipScale: 0.25,
          pipAspectRatio,
          addWatermark: true,
          onProgress: setDownloadProgress,
        })

        downloadBlob(pipBlob, "generated-video-with-pip.mp4")
      } catch (error) {
        console.error("PiP download failed:", error)
        // Fallback to regular download
        const response = await fetch(resultUrl)
        const blob = await response.blob()
        downloadBlob(blob, "generated-video.mp4")
      } finally {
        setIsDownloading(false)
        setDownloadProgress(0)
      }
    } else {
      // No PiP, but still add watermark
      try {
        setIsDownloading(true)
        setDownloadProgress(0)

        const videoBlob = await createPipVideoClient({
          mainVideoUrl: resultUrl,
          pipVideoUrl: null,
          addWatermark: true,
          onProgress: setDownloadProgress,
        })

        downloadBlob(videoBlob, "generated-video.mp4")
      } catch (error) {
        console.error("Watermark failed, downloading original:", error)
        // Fallback to regular download
        const response = await fetch(resultUrl)
        const blob = await response.blob()
        downloadBlob(blob, "generated-video.mp4")
      } finally {
        setIsDownloading(false)
        setDownloadProgress(0)
      }
    }
  }, [resultUrl, pipVideoUrl, showPip, pipAspectRatio])

  return {
    isDownloading,
    downloadProgress,
    handleDownload,
  }
}
