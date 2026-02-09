import { type NextRequest, NextResponse } from "next/server"
import { experimental_generateVideo as generateVideo } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { Agent } from "undici"
import { put } from "@vercel/blob"
import {
  updateGenerationRunId,
  updateGenerationComplete,
  updateGenerationFailed,
} from "@/lib/db"

// Allow this function to run for up to 800 seconds (13+ minutes)
// KlingAI video generation typically takes 5-12 minutes
export const maxDuration = 800

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  let generationId: number | undefined
  try {
    const body = await request.json()
    const { generationId: gId, videoUrl, characterImageUrl, characterName, userEmail } = body
    generationId = gId

    console.log(`[GenerateVideo] [${new Date().toISOString()}] Starting generation ${generationId} (v69-no-workflow)`)
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Input: characterImageUrl=${characterImageUrl}, videoUrl=${videoUrl}`)

    // Update run ID so UI knows it's processing
    await updateGenerationRunId(generationId!, `direct-${generationId}`)

    // Create gateway with extended timeouts for video generation
    const gateway = createGateway({
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          dispatcher: new Agent({
            headersTimeout: 15 * 60 * 1000,
            bodyTimeout: 15 * 60 * 1000,
          }),
        } as RequestInit),
    })

    // Generate video using AI SDK with KlingAI motion control
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Calling experimental_generateVideo with klingai/kling-v2.6-motion-control...`)

    const generateStart = Date.now()
    let result
    try {
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
            pollIntervalMs: 5_000,
            pollTimeoutMs: 14 * 60 * 1000,
          },
        },
      })
    } catch (error) {
      // Exhaustive error logging
      const elapsed = Date.now() - generateStart
      const ts = new Date().toISOString()

      console.error(`[GenerateVideo] [${ts}] === generateVideo FAILED after ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s) ===`)
      console.error(`[GenerateVideo] [${ts}] Error type: ${typeof error}`)
      console.error(`[GenerateVideo] [${ts}] Error constructor: ${error?.constructor?.name ?? "unknown"}`)

      let errorMsg = "Unknown error"

      if (error instanceof Error) {
        errorMsg = error.message
        console.error(`[GenerateVideo] [${ts}] Error.name: ${error.name}`)
        console.error(`[GenerateVideo] [${ts}] Error.message: ${error.message}`)
        console.error(`[GenerateVideo] [${ts}] Error.stack: ${error.stack}`)

        const aiErr = error as Error & { cause?: unknown; responses?: unknown; value?: unknown; data?: unknown; statusCode?: number; responseBody?: unknown }
        if (aiErr.cause !== undefined) console.error(`[GenerateVideo] [${ts}] Error.cause:`, JSON.stringify(aiErr.cause, null, 2))
        if (aiErr.responses !== undefined) console.error(`[GenerateVideo] [${ts}] Error.responses:`, JSON.stringify(aiErr.responses, null, 2))
        if (aiErr.data !== undefined) console.error(`[GenerateVideo] [${ts}] Error.data:`, JSON.stringify(aiErr.data, null, 2))
        if (aiErr.statusCode !== undefined) console.error(`[GenerateVideo] [${ts}] Error.statusCode: ${aiErr.statusCode}`)
        if (aiErr.responseBody !== undefined) console.error(`[GenerateVideo] [${ts}] Error.responseBody:`, JSON.stringify(aiErr.responseBody, null, 2))

        const allProps = Object.getOwnPropertyNames(error)
        console.error(`[GenerateVideo] [${ts}] All error properties: [${allProps.join(", ")}]`)
        for (const prop of allProps) {
          if (!["name", "message", "stack"].includes(prop)) {
            try {
              console.error(`[GenerateVideo] [${ts}] Error.${prop}:`, JSON.stringify((error as Record<string, unknown>)[prop], null, 2))
            } catch { /* not serializable */ }
          }
        }
      } else if (error && typeof error === "object") {
        const allProps = Object.getOwnPropertyNames(error)
        console.error(`[GenerateVideo] [${ts}] Non-Error object properties: [${allProps.join(", ")}]`)
        for (const prop of allProps) {
          try {
            console.error(`[GenerateVideo] [${ts}] error.${prop}:`, JSON.stringify((error as Record<string, unknown>)[prop], null, 2))
          } catch { /* not serializable */ }
        }
        try { errorMsg = JSON.stringify(error) } catch { errorMsg = String(error) }
      } else {
        errorMsg = String(error)
        console.error(`[GenerateVideo] [${ts}] Primitive error value: ${errorMsg}`)
      }

      console.error(`[GenerateVideo] [${ts}] === END ERROR DETAILS ===`)

      throw new Error(`Video generation failed: ${errorMsg}`)
    }

    const generateTime = Date.now() - generateStart
    console.log(`[GenerateVideo] [${new Date().toISOString()}] generateVideo completed in ${generateTime}ms (${(generateTime / 1000).toFixed(1)}s)`)
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Generated ${result.videos.length} video(s)`)

    if (result.videos.length === 0) {
      throw new Error("No videos were generated")
    }

    const videoBytes = result.videos[0].uint8Array
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Video size: ${videoBytes.length} bytes`)

    // Save to Vercel Blob
    const blobStart = Date.now()
    const { url: blobUrl } = await put(
      `generations/${generationId}-${Date.now()}.mp4`,
      videoBytes,
      { access: "public", contentType: "video/mp4" }
    )
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Saved to blob in ${Date.now() - blobStart}ms: ${blobUrl}`)

    // Update database
    await updateGenerationComplete(generationId!, blobUrl)
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Marked generation ${generationId} as complete`)

    // Send email notification if requested
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
      } catch (emailErr) {
        console.error("[GenerateVideo] Failed to send email:", emailErr)
      }
    }

    const totalTime = Date.now() - startTime
    console.log(`[GenerateVideo] [${new Date().toISOString()}] Generation ${generationId} completed in ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`)

    return NextResponse.json({ success: true, videoUrl: blobUrl })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[GenerateVideo] [${new Date().toISOString()}] Generation ${generationId} failed:`, errorMessage)

    // Mark as failed in DB
    if (generationId) {
      try {
        await updateGenerationFailed(generationId, errorMessage)
      } catch (dbErr) {
        console.error("[GenerateVideo] Failed to update DB:", dbErr)
      }
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
