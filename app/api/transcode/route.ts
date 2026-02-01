import { put, head } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"

// This endpoint downloads a video from Vercel Blob, transcodes it using ffmpeg,
// and uploads the fixed version back to Blob. This fixes Safari MP4 metadata issues.

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { videoUrl } = await request.json()
    
    if (!videoUrl) {
      return NextResponse.json({ error: "videoUrl is required" }, { status: 400 })
    }

    console.log(`[Transcode] Starting transcode for: ${videoUrl}`)

    // Download the original video
    const fetchStart = Date.now()
    const response = await fetch(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`)
    }
    const originalBuffer = await response.arrayBuffer()
    console.log(`[Transcode] Downloaded original video in ${Date.now() - fetchStart}ms, size: ${originalBuffer.byteLength} bytes`)

    // Import ffmpeg
    const ffmpegStart = Date.now()
    const { FFmpeg } = await import("@ffmpeg/ffmpeg")
    const { toBlobURL, fetchFile } = await import("@ffmpeg/util")
    
    const ffmpeg = new FFmpeg()
    
    // Load ffmpeg with CORS-enabled URLs
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    })
    console.log(`[Transcode] FFmpeg loaded in ${Date.now() - ffmpegStart}ms`)

    // Determine input format from URL
    const isWebM = videoUrl.includes(".webm")
    const inputExt = isWebM ? "webm" : "mp4"
    const inputFile = `input.${inputExt}`
    const outputFile = "output.mp4"

    // Write input file to ffmpeg virtual filesystem
    const writeStart = Date.now()
    await ffmpeg.writeFile(inputFile, new Uint8Array(originalBuffer))
    console.log(`[Transcode] Wrote input file in ${Date.now() - writeStart}ms`)

    // Transcode to MP4 with proper metadata
    // -movflags +faststart: Moves moov atom to beginning for streaming
    // -c:v libx264: H.264 codec (widely compatible)
    // -preset ultrafast: Fastest encoding
    // -crf 23: Good quality balance
    // -c:a aac: AAC audio codec
    const transcodeStart = Date.now()
    await ffmpeg.exec([
      "-i", inputFile,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputFile
    ])
    console.log(`[Transcode] Transcoded in ${Date.now() - transcodeStart}ms`)

    // Read the transcoded file
    const readStart = Date.now()
    const data = await ffmpeg.readFile(outputFile)
    const transcodedBuffer = (data as Uint8Array).buffer
    console.log(`[Transcode] Read output file in ${Date.now() - readStart}ms, size: ${transcodedBuffer.byteLength} bytes`)

    // Upload transcoded video to Blob
    const uploadStart = Date.now()
    const timestamp = Date.now()
    const { url: transcodedUrl } = await put(
      `transcoded/video-${timestamp}.mp4`,
      new Blob([transcodedBuffer], { type: "video/mp4" }),
      {
        access: "public",
        contentType: "video/mp4",
      }
    )
    console.log(`[Transcode] Uploaded to Blob in ${Date.now() - uploadStart}ms`)

    console.log(`[Transcode] Complete in ${Date.now() - startTime}ms: ${transcodedUrl}`)

    return NextResponse.json({ 
      success: true, 
      transcodedUrl,
      timing: {
        total: Date.now() - startTime,
        download: fetchStart ? Date.now() - fetchStart : 0,
      }
    })
  } catch (error) {
    console.error("[Transcode] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcode failed" },
      { status: 500 }
    )
  }
}
