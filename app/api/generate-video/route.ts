import { type NextRequest, NextResponse } from "next/server"
import { experimental_generateVideo as generateVideo } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { Agent } from "undici"
import { put } from "@vercel/blob"
import { updateGenerationComplete, updateGenerationFailed, updateGenerationRunId } from "@/lib/db"

// 13+ minutes - enough for KlingAI to finish
export const maxDuration = 800

// Custom gateway with extended timeouts and request logging for video generation
let pollCount = 0
const gateway = createGateway({
  fetch: async (url, init) => {
    pollCount++
    const reqNum = pollCount
    const ts = new Date().toISOString()
    const method = (init as RequestInit)?.method || "GET"
    const urlStr = typeof url === "string" ? url : (url as URL).toString()
    
    console.log(`[GenerateVideo] [${ts}] Gateway request #${reqNum}: ${method} ${urlStr.substring(0, 120)}`)
    
    const fetchStart = Date.now()
    const response = await fetch(url, {
      ...init,
      dispatcher: new Agent({
        headersTimeout: 15 * 60 * 1000,
        bodyTimeout: 15 * 60 * 1000,
      }),
    } as RequestInit)
    
    const fetchTime = Date.now() - fetchStart
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Gateway response #${reqNum}: ${response.status} in ${fetchTime}ms (${(fetchTime / 1000).toFixed(1)}s)`)
    
    return response
  },
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  let body: {
    generationId: number
    videoUrl: string
    characterImageUrl: string
    characterName?: string
    userEmail?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { generationId, videoUrl, characterImageUrl, characterName, userEmail } = body

  pollCount = 0
  console.log(`[GenerateVideo] [${new Date().toISOString()}] Starting generation ${generationId} (maxDuration=800, no workflow)`)

  // Update run ID so UI knows it's processing
  await updateGenerationRunId(generationId, `direct-${generationId}`)

  try {
    // --- Step 1: Generate video via AI SDK + KlingAI ---
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Calling generateVideo with klingai/kling-v2.6-motion-control...`)

    const result = await generateVideo({
      model: gateway.video("klingai/kling-v2.6-motion-control"),
      prompt: {
        image: characterImageUrl,
      },
      providerOptions: {
        klingai: {
          videoUrl: videoUrl,
          characterOrientation: "video" as const,
          mode: "std" as const,
          pollIntervalMs: 5_000,
          pollTimeoutMs: 14 * 60 * 1000,
        },
      },
    })

    const generateTime = Date.now() - startTime
    console.log(`[GenerateVideo] [${new Date().toISOString()}] generateVideo completed in ${generateTime}ms (${(generateTime / 1000).toFixed(1)}s)`)
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Generated ${result.videos.length} video(s)`)

    if (result.videos.length === 0) {
      throw new Error("No videos were generated")
    }

    const videoBytes = result.videos[0].uint8Array

    // --- Step 2: Save to Vercel Blob ---
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Saving ${videoBytes.length} bytes to Vercel Blob...`)

    const { url: blobUrl } = await put(
      `generations/${generationId}-${Date.now()}.mp4`,
      videoBytes,
      { access: "public", contentType: "video/mp4" }
    )

    console.log(`[GenerateVideo] [${new Date().toISOString()}] Saved to blob: ${blobUrl}`)

    // --- Step 3: Update database ---
    await updateGenerationComplete(generationId, blobUrl)
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Marked generation ${generationId} as complete`)

    // --- Step 4: Send email notification ---
    if (userEmail) {
      try {
        const { Resend } = await import("resend")
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: "v0 Face Swap <noreply@resend.dev>",
          to: userEmail,
          subject: "Your video is ready!",
          html: `
            <h1>Your face swap video is ready!</h1>
            ${characterName ? `<p>Character: ${characterName}</p>` : ""}
            <p>Click below to view your video:</p>
            <p><a href="${blobUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">View Video</a></p>
            <p style="margin-top:20px;color:#666;font-size:14px;">Or copy this link: ${blobUrl}</p>
          `,
        })
        console.log(`[GenerateVideo] Email sent to ${userEmail}`)
      } catch (emailError) {
        console.error("[GenerateVideo] Failed to send email:", emailError)
      }
    }

    const totalTime = Date.now() - startTime
    console.log(`[GenerateVideo] [TIMING] Total: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`)

    return NextResponse.json({ success: true, videoUrl: blobUrl })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[GenerateVideo] [${new Date().toISOString()}] FAILED after ${elapsed}ms:`, error)

    const errorMessage = error instanceof Error ? error.message : String(error)
    await updateGenerationFailed(generationId, errorMessage)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
