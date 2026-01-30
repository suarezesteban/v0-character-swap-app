"use client"

// Dynamic import to avoid SSR issues
let Mp4Muxer: typeof import("mp4-muxer") | null = null

/**
 * Check if browser is Safari (needs special video encoding)
 */
export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

/**
 * Check if WebCodecs is available
 */
export function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined"
}

interface EncoderConfig {
  width: number
  height: number
  frameRate: number
  bitrate: number
}

/**
 * Safari Video Encoder using WebCodecs + mp4-muxer
 * Creates videos with proper metadata that fal.ai can read
 */
export class SafariVideoEncoder {
  private muxer: Mp4Muxer.Muxer<Mp4Muxer.ArrayBufferTarget> | null = null
  private videoEncoder: VideoEncoder | null = null
  private config: EncoderConfig
  private frameCount = 0
  private isFinalized = false

  constructor(config: EncoderConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    console.log("[v0] SafariVideoEncoder: Starting with config:", this.config)

    // Dynamic import mp4-muxer (avoid SSR issues)
    if (!Mp4Muxer) {
      Mp4Muxer = await import("mp4-muxer")
    }

    // Create mp4-muxer
    this.muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: "avc",
        width: this.config.width,
        height: this.config.height,
      },
      fastStart: "in-memory", // Puts metadata at the beginning - crucial for fal.ai
    })

    // Create VideoEncoder
    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.muxer?.addVideoChunk(chunk, meta)
      },
      error: (e) => {
        console.error("[v0] SafariVideoEncoder: VideoEncoder error:", e)
      },
    })

    // Configure encoder
    await this.videoEncoder.configure({
      codec: "avc1.42001f", // H.264 Baseline Profile Level 3.1
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.frameRate,
    })

    console.log("[v0] SafariVideoEncoder: Started successfully")
  }

  async addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    if (!this.videoEncoder || this.isFinalized) return

    const timestamp = (this.frameCount * 1_000_000) / this.config.frameRate // microseconds
    const frame = new VideoFrame(canvas, {
      timestamp,
      duration: 1_000_000 / this.config.frameRate,
    })

    this.videoEncoder.encode(frame, { keyFrame: this.frameCount % 30 === 0 })
    frame.close()
    this.frameCount++
  }

  async finish(): Promise<Blob> {
    if (this.isFinalized || !this.videoEncoder || !this.muxer) {
      throw new Error("Encoder not initialized or already finalized")
    }

    console.log("[v0] SafariVideoEncoder: Finishing, frames encoded:", this.frameCount)

    // Flush encoder
    await this.videoEncoder.flush()
    this.videoEncoder.close()

    // Finalize muxer
    this.muxer.finalize()
    const buffer = this.muxer.target.buffer

    this.isFinalized = true
    console.log("[v0] SafariVideoEncoder: Finished, buffer size:", buffer.byteLength)

    return new Blob([buffer], { type: "video/mp4" })
  }
}

/**
 * Record video from canvas stream using WebCodecs for Safari
 * This creates a proper MP4 with correct metadata
 */
export async function recordWithWebCodecs(
  canvas: HTMLCanvasElement,
  audioStream: MediaStream | null,
  durationMs: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const width = canvas.width
  const height = canvas.height
  const frameRate = 30
  const bitrate = 5_000_000

  const encoder = new SafariVideoEncoder({ width, height, frameRate, bitrate })
  await encoder.start()

  const totalFrames = Math.ceil((durationMs / 1000) * frameRate)
  let currentFrame = 0

  return new Promise((resolve, reject) => {
    const captureFrame = async () => {
      if (currentFrame >= totalFrames) {
        try {
          const blob = await encoder.finish()
          resolve(blob)
        } catch (e) {
          reject(e)
        }
        return
      }

      try {
        await encoder.addFrame(canvas)
        currentFrame++
        
        if (onProgress) {
          onProgress(Math.round((currentFrame / totalFrames) * 100))
        }

        // Schedule next frame
        requestAnimationFrame(captureFrame)
      } catch (e) {
        reject(e)
      }
    }

    captureFrame()
  })
}
