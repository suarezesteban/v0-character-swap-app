import { type NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { experimental_generateVideo as generateVideo } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { Agent } from "undici"
import { put } from "@vercel/blob"
import { createGeneration, updateGenerationStartProcessing, updateGenerationComplete, updateGenerationFailed, updateGenerationRunId } from "@/lib/db"

// 13+ minutes - enough for KlingAI to finish
export const maxDuration = 800

// Single reusable agent with extended timeouts (per AI Gateway team recommendation)
const longTimeoutAgent = new Agent({
  headersTimeout: 15 * 60 * 1000, // 15 minutes
  bodyTimeout: 15 * 60 * 1000,
})

const gateway = createGateway({
  fetch: async (url, init) => {
    const ts = new Date().toISOString()
    const method = (init as RequestInit)?.method || "GET"
    const urlStr = typeof url === "string" ? url : (url as URL).toString()
    
    console.log(`[GenerateVideo] [${ts}] Gateway request: ${method} ${urlStr.substring(0, 120)}`)
    
    const fetchStart = Date.now()
    const response = await fetch(url, {
      ...init,
      dispatcher: longTimeoutAgent,
    } as RequestInit)
    
    const fetchTime = Date.now() - fetchStart
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Gateway response: ${response.status} in ${(fetchTime / 1000).toFixed(1)}s`)
    
    return response
  },
})

async function runVideoGeneration(params: {
  generationId: number
  videoUrl: string
  characterImageUrl: string
  characterName?: string
  userEmail?: string
}) {
  const { generationId, videoUrl, characterImageUrl, characterName, userEmail } = params
  const startTime = Date.now()

  console.log(`[GenerateVideo] [${new Date().toISOString()}] Starting generation ${generationId} (maxDuration=800, using after())`)

  await updateGenerationRunId(generationId, `direct-${generationId}`)

  try {
    const MAX_RETRIES = 3
    let result: Awaited<ReturnType<typeof generateVideo>> | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[GenerateVideo] [${new Date().toISOString()}] Calling generateVideo (attempt ${attempt}/${MAX_RETRIES})...`)

        result = await generateVideo({
          model: gateway.video("klingai/kling-v2.6-motion-control"),
          prompt: {
            image: characterImageUrl,
          },
          providerOptions: {
            klingai: {
              videoUrl: videoUrl,
              characterOrientation: "video" as const,
              mode: "std" as const,
              pollTimeoutMs: 12 * 60 * 1000,
            },
          },
        })

        // Success - break out of retry loop
        break
      } catch (retryError) {
        // Walk the full cause chain to find socket/connection errors
        // Error structure: GatewayResponseError -> AI_APICallError -> SocketError
        const isRetryable = (() => {
          let err: unknown = retryError
          while (err instanceof Error) {
            if (
              err.message.includes("other side closed") ||
              err.message.includes("socket") ||
              err.message.includes("ECONNRESET") ||
              err.message.includes("Cannot connect to API") ||
              err.message.includes("Gateway request failed") ||
              (err as { isRetryable?: boolean }).isRetryable === true
            ) {
              return true
            }
            err = err.cause
          }
          return false
        })()

        if (isRetryable && attempt < MAX_RETRIES) {
          const waitSec = attempt * 10
          console.warn(`[GenerateVideo] [${new Date().toISOString()}] Gateway error on attempt ${attempt}. Retrying in ${waitSec}s...`)
          await new Promise(resolve => setTimeout(resolve, waitSec * 1000))
          continue
        }

        // Not retryable or last attempt - rethrow
        throw retryError
      }
    }

    if (!result) {
      throw new Error("generateVideo returned no result after all retries")
    }

    const generateTime = Date.now() - startTime
    console.log(`[GenerateVideo] [${new Date().toISOString()}] generateVideo completed in ${(generateTime / 1000).toFixed(1)}s, ${result.videos.length} video(s)`)

    if (result.videos.length === 0) {
      throw new Error("No videos were generated")
    }

    const videoBytes = result.videos[0].uint8Array
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Saving ${videoBytes.length} bytes to Blob...`)

    const { url: blobUrl } = await put(
      `generations/${generationId}-${Date.now()}.mp4`,
      videoBytes,
      { access: "public", contentType: "video/mp4" }
    )

    console.log(`[GenerateVideo] [${new Date().toISOString()}] Saved: ${blobUrl}`)

    await updateGenerationComplete(generationId, blobUrl)
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Generation ${generationId} complete`)

    // Send email if requested
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
            <p><a href="${blobUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">View Video</a></p>
          `,
        })
        console.log(`[GenerateVideo] Email sent to ${userEmail}`)
      } catch (emailError) {
        console.error("[GenerateVideo] Email failed:", emailError)
      }
    }

    console.log(`[GenerateVideo] [TIMING] Total: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[GenerateVideo] FAILED after ${(elapsed / 1000).toFixed(1)}s:`, error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    await updateGenerationFailed(generationId, errorMessage)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { generationId: existingGenerationId, videoUrl, characterImageUrl, userId, userEmail, characterName, sendEmail } = body

    if (!videoUrl || !characterImageUrl) {
      return NextResponse.json(
        { error: "Video URL and character image URL are required" },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User must be logged in" },
        { status: 401 }
      )
    }

    let generationId = existingGenerationId

    if (existingGenerationId) {
      await updateGenerationStartProcessing(existingGenerationId, videoUrl, characterImageUrl)
    } else {
      generationId = await createGeneration({
        userId,
        userEmail: sendEmail ? userEmail : undefined,
        videoUrl,
        characterName: characterName || undefined,
        characterImageUrl,
      })

      if (!generationId) {
        return NextResponse.json(
          { error: "Failed to create generation record" },
          { status: 500 }
        )
      }
    }

    // Use after() to run video generation AFTER sending the response
    // This keeps the serverless function alive for up to maxDuration (800s)
    // while the client gets an immediate response
    after(
      runVideoGeneration({
        generationId,
        videoUrl,
        characterImageUrl,
        characterName: characterName || undefined,
        userEmail: sendEmail ? userEmail : undefined,
      })
    )

    return NextResponse.json({
      success: true,
      generationId,
      message: "Video generation started",
    })
  } catch (error) {
    console.error("Generate error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start video generation" },
      { status: 500 }
    )
  }
}
