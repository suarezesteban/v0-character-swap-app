"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

let ffmpeg: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg
  
  ffmpeg = new FFmpeg()
  
  // Load ffmpeg with CORS-enabled URLs
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })
  
  return ffmpeg
}

export interface PipOptions {
  mainVideoUrl: string
  pipVideoUrl?: string | null
  pipPosition?: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  pipScale?: number // 0.0 to 1.0, default 0.25
  onProgress?: (progress: number) => void
  addWatermark?: boolean
}

export async function createPipVideoClient({
  mainVideoUrl,
  pipVideoUrl,
  pipPosition = "bottom-right",
  pipScale = 0.2,
  onProgress,
  addWatermark = true,
}: PipOptions): Promise<Blob> {
  const ff = await getFFmpeg()
  
  onProgress?.(0.1)
  
  // Fetch main video (and pip video if provided)
  const mainData = await fetchFile(mainVideoUrl)
  const pipData = pipVideoUrl ? await fetchFile(pipVideoUrl) : null
  
  onProgress?.(0.3)
  
  // Write files to ffmpeg virtual filesystem
  await ff.writeFile("main.mp4", mainData)
  if (pipData) {
    await ff.writeFile("pip.webm", pipData)
  }
  
  onProgress?.(0.4)
  
  // Calculate overlay position based on pipPosition
  // overlay_w and overlay_h refer to the PiP video dimensions after scaling
  // W and H refer to the main video dimensions
  const positionMap = {
    "bottom-right": `W-overlay_w-20:H-overlay_h-20`,
    "bottom-left": `20:H-overlay_h-20`,
    "top-right": `W-overlay_w-20:20`,
    "top-left": `20:20`,
  }
  
  const overlayPosition = positionMap[pipPosition]
  
  // Watermark text - positioned at bottom left with some padding
  const watermarkText = "Generated with mimicme.vercel.app"
  // Escape special characters for ffmpeg drawtext
  const escapedText = watermarkText.replace(/:/g, "\\:")
  
  // Build filter complex based on options
  let filterComplex = ""
  
  if (pipData) {
    // With PiP overlay
    filterComplex = `[1:v]scale=iw*${pipScale}:ih*${pipScale}[pip];[0:v][pip]overlay=${overlayPosition}:shortest=1`
    if (addWatermark) {
      filterComplex += `[vid];[vid]drawtext=text='${escapedText}':fontsize=16:fontcolor=white@0.7:x=20:y=h-30`
    }
  } else {
    // No PiP, just watermark
    if (addWatermark) {
      filterComplex = `drawtext=text='${escapedText}':fontsize=16:fontcolor=white@0.7:x=20:y=h-30`
    }
  }
  
  // Build ffmpeg command
  const ffmpegArgs = ["-i", "main.mp4"]
  
  if (pipData) {
    ffmpegArgs.push("-i", "pip.webm")
  }
  
  if (filterComplex) {
    ffmpegArgs.push("-filter_complex", filterComplex)
  }
  
  ffmpegArgs.push(
    "-c:v", "libx264",
    "-preset", "fast",
    "-c:a", "aac",
    "-shortest",
    "output.mp4"
  )
  
  await ff.exec(ffmpegArgs)
  
  onProgress?.(0.9)
  
  // Read the output file
  const outputData = await ff.readFile("output.mp4")
  
  // Clean up
  await ff.deleteFile("main.mp4")
  if (pipData) {
    await ff.deleteFile("pip.webm")
  }
  await ff.deleteFile("output.mp4")
  
  onProgress?.(1.0)
  
  // Convert to Blob
  return new Blob([outputData], { type: "video/mp4" })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
