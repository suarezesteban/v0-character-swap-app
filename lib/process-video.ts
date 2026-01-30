"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

let ffmpeg: FFmpeg | null = null
let ffmpegLoaded = false

async function loadFFmpeg() {
  if (ffmpegLoaded && ffmpeg) return ffmpeg
  
  ffmpeg = new FFmpeg()
  
  // Load ffmpeg-core from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })
  
  ffmpegLoaded = true
  return ffmpeg
}

/**
 * Process video to fix metadata issues (especially for Safari)
 * Re-encodes to ensure proper duration and timestamps
 */
export async function processVideoForUpload(
  blob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log("[v0] Processing video with ffmpeg...")
  
  const ff = await loadFFmpeg()
  
  // Determine input format from blob type
  const inputExt = blob.type.includes("mp4") ? "mp4" : "webm"
  const inputFile = `input.${inputExt}`
  const outputFile = "output.mp4"
  
  // Write input file
  const inputData = await fetchFile(blob)
  await ff.writeFile(inputFile, inputData)
  
  // Set up progress tracking
  if (onProgress) {
    ff.on("progress", ({ progress }) => {
      onProgress(Math.round(progress * 100))
    })
  }
  
  // Re-encode to MP4 with proper metadata
  // -movflags +faststart puts metadata at the beginning of the file
  await ff.exec([
    "-i", inputFile,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-c:a", "aac",
    "-movflags", "+faststart",
    "-y",
    outputFile
  ])
  
  // Read output file
  const outputData = await ff.readFile(outputFile)
  
  // Clean up
  await ff.deleteFile(inputFile)
  await ff.deleteFile(outputFile)
  
  console.log("[v0] Video processed successfully")
  
  return new Blob([outputData], { type: "video/mp4" })
}

/**
 * Check if browser is Safari (needs video processing)
 */
export function needsVideoProcessing(): boolean {
  if (typeof navigator === "undefined") return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}
