import { put } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { fal } from "@fal-ai/client"

// This endpoint uses fal.ai's ffmpeg API to transcode videos
// This fixes Safari MP4 metadata issues by re-encoding with proper moov atom placement

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { videoUrl } = await request.json()
    
    if (!videoUrl) {
      return NextResponse.json({ error: "videoUrl is required" }, { status: 400 })
    }

    console.log(`[Transcode] Starting cloud transcode for: ${videoUrl}`)

    // Configure fal client
    fal.config({ credentials: process.env.FAL_KEY })

    // First, upload the video to fal.storage so fal can access it
    const uploadStart = Date.now()
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`)
    }
    const videoBlob = await videoResponse.blob()
    console.log(`[Transcode] Downloaded video in ${Date.now() - uploadStart}ms, size: ${videoBlob.size} bytes`)
    
    const falVideoUrl = await fal.storage.upload(videoBlob)
    console.log(`[Transcode] Uploaded to fal.storage: ${falVideoUrl}`)

    // Use fal.ai's ffmpeg API to transcode
    // -movflags +faststart: Moves moov atom to beginning for streaming compatibility
    // -c:v libx264: H.264 codec (universal compatibility)
    // -c:a aac: AAC audio codec
    const transcodeStart = Date.now()
    const result = await fal.subscribe("fal-ai/ffmpeg-api", {
      input: {
        input_file: falVideoUrl,
        arguments: "-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart",
      },
    })
    
    console.log(`[Transcode] fal.ai ffmpeg completed in ${Date.now() - transcodeStart}ms`)
    console.log(`[Transcode] Result:`, JSON.stringify(result, null, 2))

    // Get the output URL from fal result
    const outputUrl = (result.data as any)?.output_file?.url
    
    if (!outputUrl) {
      throw new Error("fal.ai ffmpeg did not return output URL")
    }

    // Download the transcoded video and upload to our Blob storage
    const blobUploadStart = Date.now()
    const transcodedResponse = await fetch(outputUrl)
    if (!transcodedResponse.ok) {
      throw new Error(`Failed to download transcoded video: ${transcodedResponse.status}`)
    }
    const transcodedBlob = await transcodedResponse.blob()
    
    const timestamp = Date.now()
    const { url: transcodedUrl } = await put(
      `transcoded/video-${timestamp}.mp4`,
      transcodedBlob,
      {
        access: "public",
        contentType: "video/mp4",
      }
    )
    console.log(`[Transcode] Uploaded to Blob in ${Date.now() - blobUploadStart}ms: ${transcodedUrl}`)

    console.log(`[Transcode] Complete in ${Date.now() - startTime}ms`)

    return NextResponse.json({ 
      success: true, 
      transcodedUrl,
      timing: {
        total: Date.now() - startTime,
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
