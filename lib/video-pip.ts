/**
 * Video PiP (Picture-in-Picture) overlay using FFmpeg WASM
 * Overlays the original video in the bottom-right corner of the generated video
 */

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

let ffmpegInstance: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance
  }

  const ffmpeg = new FFmpeg()
  
  // Load FFmpeg WASM from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })

  ffmpegInstance = ffmpeg
  return ffmpeg
}

export interface PipOptions {
  /** Size of PiP as percentage of main video width (default: 25) */
  pipSizePercent?: number
  /** Padding from edges in pixels (default: 20) */
  padding?: number
  /** Border radius for PiP (default: 12) */
  borderRadius?: number
  /** Position: "bottom-right" | "bottom-left" | "top-right" | "top-left" */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left"
}

/**
 * Creates a video with PiP overlay
 * @param mainVideoUrl - URL of the main video (generated video from fal.ai)
 * @param pipVideoUrl - URL of the overlay video (original user recording)
 * @param options - PiP configuration options
 * @returns Blob of the composed video
 */
export async function createPipVideo(
  mainVideoUrl: string,
  pipVideoUrl: string,
  options: PipOptions = {}
): Promise<Blob> {
  const {
    pipSizePercent = 25,
    padding = 20,
    position = "bottom-right",
  } = options

  console.log(`[PiP] Starting video composition...`)
  console.log(`[PiP] Main video: ${mainVideoUrl}`)
  console.log(`[PiP] PiP video: ${pipVideoUrl}`)

  const ffmpeg = await getFFmpeg()
  
  // Download both videos
  console.log(`[PiP] Downloading main video...`)
  const mainVideoData = await fetchFile(mainVideoUrl)
  console.log(`[PiP] Main video downloaded: ${mainVideoData.byteLength} bytes`)
  
  console.log(`[PiP] Downloading PiP video...`)
  const pipVideoData = await fetchFile(pipVideoUrl)
  console.log(`[PiP] PiP video downloaded: ${pipVideoData.byteLength} bytes`)

  // Write files to FFmpeg virtual filesystem
  await ffmpeg.writeFile("main.mp4", mainVideoData)
  await ffmpeg.writeFile("pip.mp4", pipVideoData)

  // Build position overlay filter
  // Scale PiP to percentage of main video width, then position it
  const pipScale = `iw*${pipSizePercent / 100}`
  let overlayPosition: string
  
  switch (position) {
    case "bottom-right":
      overlayPosition = `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`
      break
    case "bottom-left":
      overlayPosition = `${padding}:main_h-overlay_h-${padding}`
      break
    case "top-right":
      overlayPosition = `main_w-overlay_w-${padding}:${padding}`
      break
    case "top-left":
      overlayPosition = `${padding}:${padding}`
      break
  }

  // FFmpeg filter: scale PiP, add rounded corners, overlay on main
  // Note: Using a simple scale + overlay without rounded corners for compatibility
  const filterComplex = [
    `[1:v]scale=${pipScale}:-1[pip]`,
    `[0:v][pip]overlay=${overlayPosition}:shortest=1[out]`
  ].join(";")

  console.log(`[PiP] Running FFmpeg with filter: ${filterComplex}`)

  // Run FFmpeg
  // -i main.mp4: Main video input
  // -i pip.mp4: PiP video input  
  // -filter_complex: Apply scaling and overlay
  // -map [out]: Map the output video stream
  // -map 0:a?: Map audio from main video (? makes it optional)
  // -c:v libx264: Use H.264 codec
  // -c:a aac: Use AAC audio codec
  // -shortest: End when shortest input ends
  await ffmpeg.exec([
    "-i", "main.mp4",
    "-i", "pip.mp4",
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "output.mp4"
  ])

  console.log(`[PiP] FFmpeg completed, reading output...`)

  // Read the output file
  const outputData = await ffmpeg.readFile("output.mp4")
  
  // Clean up
  await ffmpeg.deleteFile("main.mp4")
  await ffmpeg.deleteFile("pip.mp4")
  await ffmpeg.deleteFile("output.mp4")

  console.log(`[PiP] Output video size: ${outputData.byteLength} bytes`)

  // Convert to Blob
  return new Blob([outputData], { type: "video/mp4" })
}
