"use client"

import { useState, useCallback, useRef } from "react"

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
 * Hook to process video using ffmpeg.wasm in the browser
 * This fixes Safari MP4 metadata issues by re-encoding with proper settings
 */
export function useVideoProcessor(): UseVideoProcessorReturn {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const ffmpegRef = useRef<any>(null)
  const loadedRef = useRef(false)

  const processVideo = useCallback(async (inputBlob: Blob): Promise<Blob> => {
    setIsProcessing(true)
    setProgress({ stage: "loading", percent: 0, message: "Loading processor..." })

    try {
      // Dynamically import ffmpeg.wasm
      const { FFmpeg } = await import("@ffmpeg/ffmpeg")
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util")

      // Initialize FFmpeg if not already loaded
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg()
      }
      
      const ffmpeg = ffmpegRef.current

      if (!loadedRef.current) {
        setProgress({ stage: "loading", percent: 10, message: "Downloading ffmpeg..." })
        
        // Load ffmpeg with CORS-enabled URLs
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
        
        ffmpeg.on("log", ({ message }: { message: string }) => {
          console.log("[ffmpeg]", message)
        })

        ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
          const percent = Math.round(30 + p * 60) // 30-90% for processing
          setProgress({ stage: "processing", percent, message: "Processing video..." })
        })

        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        })
        
        loadedRef.current = true
      }

      setProgress({ stage: "processing", percent: 25, message: "Preparing video..." })

      // Determine input format
      const inputExt = inputBlob.type.includes("mp4") ? "mp4" : 
                       inputBlob.type.includes("quicktime") ? "mov" : "webm"
      const inputFile = `input.${inputExt}`
      const outputFile = "output.mp4"

      // Write input file to ffmpeg's virtual filesystem
      const inputData = await fetchFile(inputBlob)
      await ffmpeg.writeFile(inputFile, inputData)

      setProgress({ stage: "processing", percent: 30, message: "Re-encoding video..." })

      // Run ffmpeg to re-encode with proper settings
      // -movflags +faststart: Put moov atom at beginning (critical for Safari compatibility)
      // -c:v libx264: Use H.264 codec (universal support)
      // -preset ultrafast: Fast encoding (we're in the browser)
      // -crf 23: Good quality/size balance
      // -c:a aac: Use AAC audio codec
      // -pix_fmt yuv420p: Standard pixel format for compatibility
      await ffmpeg.exec([
        "-i", inputFile,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-y",
        outputFile
      ])

      setProgress({ stage: "processing", percent: 90, message: "Finalizing..." })

      // Read the output file
      const outputData = await ffmpeg.readFile(outputFile)
      
      // Clean up files
      await ffmpeg.deleteFile(inputFile)
      await ffmpeg.deleteFile(outputFile)

      // Create blob from output
      const outputBlob = new Blob([outputData], { type: "video/mp4" })

      setProgress({ stage: "done", percent: 100, message: "Done!" })
      setIsProcessing(false)

      return outputBlob
    } catch (error) {
      console.error("Video processing error:", error)
      setProgress({ 
        stage: "error", 
        percent: 0, 
        message: error instanceof Error ? error.message : "Processing failed" 
      })
      setIsProcessing(false)
      
      // Return original blob if processing fails - let fal.ai try to handle it
      return inputBlob
    }
  }, [])

  return {
    processVideo,
    progress,
    isProcessing,
  }
}
