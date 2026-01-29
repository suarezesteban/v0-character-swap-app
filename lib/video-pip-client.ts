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
  pipVideoUrl: string
  pipPosition?: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  pipScale?: number // 0.0 to 1.0, default 0.25
  onProgress?: (progress: number) => void
}

export async function createPipVideoClient({
  mainVideoUrl,
  pipVideoUrl,
  pipPosition = "bottom-right",
  pipScale = 0.2,
  onProgress,
}: PipOptions): Promise<Blob> {
  const ff = await getFFmpeg()
  
  onProgress?.(0.1)
  
  // Fetch both videos
  const [mainData, pipData] = await Promise.all([
    fetchFile(mainVideoUrl),
    fetchFile(pipVideoUrl),
  ])
  
  onProgress?.(0.3)
  
  // Write files to ffmpeg virtual filesystem
  await ff.writeFile("main.mp4", mainData)
  await ff.writeFile("pip.webm", pipData)
  
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
  
  // ffmpeg command to overlay PiP video
  // -i main.mp4: input main video
  // -i pip.webm: input pip video
  // [1:v]scale=iw*0.2:ih*0.2: scale pip to 20% of its original size
  // [0:v][pip]overlay: overlay pip on main video
  // -shortest: end when shortest input ends
  await ff.exec([
    "-i", "main.mp4",
    "-i", "pip.webm",
    "-filter_complex", 
    `[1:v]scale=iw*${pipScale}:ih*${pipScale}[pip];[0:v][pip]overlay=${overlayPosition}:shortest=1`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-c:a", "aac",
    "-shortest",
    "output.mp4"
  ])
  
  onProgress?.(0.9)
  
  // Read the output file
  const outputData = await ff.readFile("output.mp4")
  
  // Clean up
  await ff.deleteFile("main.mp4")
  await ff.deleteFile("pip.webm")
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
