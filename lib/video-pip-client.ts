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
  pipAspectRatio?: "9:16" | "16:9" | "fill" // aspect ratio of pip video
  onProgress?: (progress: number) => void
  addWatermark?: boolean
}

export async function createPipVideoClient({
  mainVideoUrl,
  pipVideoUrl,
  pipPosition = "bottom-right",
  pipScale = 0.2,
  pipAspectRatio = "9:16",
  onProgress,
  addWatermark = true,
}: PipOptions): Promise<Blob> {
  const ff = await getFFmpeg()
  
  // Set up progress listener for ffmpeg processing
  const progressHandler = ({ progress: p }: { progress: number }) => {
    // Map ffmpeg progress (0-1) to 40-90% of total progress
    const percent = 0.4 + p * 0.5
    onProgress?.(percent)
  }
  ff.on("progress", progressHandler)
  
  onProgress?.(0.05)
  
  // Fetch main video (and pip video if provided)
  onProgress?.(0.1)
  const mainData = await fetchFile(mainVideoUrl)
  onProgress?.(0.2)
  const pipData = pipVideoUrl ? await fetchFile(pipVideoUrl) : null
  
  // Fetch font for watermark
  let fontData: Uint8Array | null = null
  if (addWatermark) {
    try {
      const fontUrl = "https://cdn.jsdelivr.net/fontsource/fonts/geist-mono@latest/latin-400-normal.ttf"
      fontData = await fetchFile(fontUrl)
    } catch (e) {
      console.warn("Failed to load font for watermark:", e)
    }
  }
  
  onProgress?.(0.35)
  
  // Write files to ffmpeg virtual filesystem
  await ff.writeFile("main.mp4", mainData)
  if (pipData) {
    await ff.writeFile("pip.webm", pipData)
  }
  if (fontData) {
    await ff.writeFile("font.ttf", fontData)
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
  
  // Build watermark filter if font is available
  const watermarkFilter = fontData 
    ? `drawtext=text='${escapedText}':fontfile=font.ttf:fontsize=18:fontcolor=white@0.8:x=20:y=h-40:shadowcolor=black@0.5:shadowx=1:shadowy=1`
    : ""
  
  // Build filter complex based on options
  let filterComplex = ""
  
  if (pipData) {
    // Calculate PiP dimensions based on aspect ratio
    // For 9:16, we want height-based scaling; for 16:9, width-based
    // Using main video height (H) as reference, PiP height = H * pipScale
    let pipScaleFilter: string
    const cornerRadius = 12 // rounded corners radius in pixels
    
    if (pipAspectRatio === "9:16") {
      // Height is the reference, width = height * 9/16
      // Scale to a fixed height based on pipScale, maintain 9:16 ratio
      pipScaleFilter = `scale=-1:ih*${pipScale}:force_original_aspect_ratio=decrease,crop=trunc(ih*9/16/2)*2:ih`
    } else if (pipAspectRatio === "16:9") {
      // Width is the reference
      pipScaleFilter = `scale=iw*${pipScale}:-1:force_original_aspect_ratio=decrease,crop=iw:trunc(iw*9/16/2)*2`
    } else {
      // Fill - maintain original aspect ratio
      pipScaleFilter = `scale=iw*${pipScale}:ih*${pipScale}`
    }
    
    // Add rounded corners using format and geq filter for alpha masking
    // Create rounded rectangle mask effect with drawbox and overlay
    const roundedFilter = `format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(gt(abs(W/2-X),W/2-${cornerRadius})*gt(abs(H/2-Y),H/2-${cornerRadius}),(1-ceil(hypot(abs(W/2-X)-(W/2-${cornerRadius}),abs(H/2-Y)-(H/2-${cornerRadius}))-${cornerRadius}))*255,255)'`
    
    // With PiP overlay and rounded corners
    filterComplex = `[1:v]${pipScaleFilter},${roundedFilter}[pip];[0:v][pip]overlay=${overlayPosition}:shortest=1`
    if (addWatermark && watermarkFilter) {
      filterComplex += `[vid];[vid]${watermarkFilter}`
    }
  } else {
    // No PiP, just watermark
    if (addWatermark && watermarkFilter) {
      filterComplex = watermarkFilter
    }
  }
  
  // If no filters needed, just return the original video
  if (!filterComplex) {
    // Clean up
    ff.off("progress", progressHandler)
    await ff.deleteFile("main.mp4")
    if (pipData) {
      await ff.deleteFile("pip.webm")
    }
    if (fontData) {
      await ff.deleteFile("font.ttf")
    }
    onProgress?.(1.0)
    // Fetch original and return
    const response = await fetch(mainVideoUrl)
    return await response.blob()
  }
  
  // Build ffmpeg command
  const ffmpegArgs = ["-i", "main.mp4"]
  
  if (pipData) {
    ffmpegArgs.push("-i", "pip.webm")
  }
  
  ffmpegArgs.push("-filter_complex", filterComplex)
  
  ffmpegArgs.push(
    "-c:v", "libx264",
    "-preset", "fast",
    "-c:a", "aac",
    "-shortest",
    "output.mp4"
  )
  
  await ff.exec(ffmpegArgs)
  
  // Remove progress listener
  ff.off("progress", progressHandler)
  
  onProgress?.(0.92)
  
  // Read the output file
  const outputData = await ff.readFile("output.mp4")
  
  // Clean up
  await ff.deleteFile("main.mp4")
  if (pipData) {
    await ff.deleteFile("pip.webm")
  }
  if (fontData) {
    await ff.deleteFile("font.ttf")
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
