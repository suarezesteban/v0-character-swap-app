import { type NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { createGeneration, updateGenerationStartProcessing, updateGenerationRunId, updateGenerationComplete, updateGenerationFailed } from "@/lib/db"

// This route runs the video generation DIRECTLY (no workflow).
// Used to test whether the Workflow SDK step is causing the ~340s timeout.
// The after() callback runs after the response is sent, keeping the function alive up to maxDuration.
export const maxDuration = 800

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

    await updateGenerationRunId(generationId, `direct-${generationId}`)

    console.log(`[GenerateDirect] Starting direct generation ${generationId} (no workflow)`)

    // Run the generation in the background after sending the response.
    // The function stays alive up to maxDuration (800s).
    after(async () => {
      try {
        const startTime = Date.now()
        console.log(`[GenerateDirect] [${new Date().toISOString()}] Background generation starting for ${generationId}`)

        const blobUrl = await generateAndSaveVideoDirect(generationId, videoUrl, characterImageUrl)

        const elapsed = Date.now() - startTime
        console.log(`[GenerateDirect] [${new Date().toISOString()}] Generation ${generationId} completed in ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s): ${blobUrl}`)

        await updateGenerationComplete(generationId, blobUrl)

        // Send email if requested
        if (sendEmail && userEmail) {
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
              `,
            })
            console.log(`[GenerateDirect] Email sent to ${userEmail}`)
          } catch (emailErr) {
            console.error("[GenerateDirect] Email failed:", emailErr)
          }
        }
      } catch (error) {
        let errorMessage = "Unknown error"
        if (error instanceof Error) {
          errorMessage = `${error.message}${error.stack ? `\n${error.stack}` : ""}`
        } else if (error && typeof error === "object") {
          try {
            errorMessage = JSON.stringify(error, null, 2)
          } catch {
            errorMessage = String(error)
          }
        } else {
          errorMessage = String(error)
        }
        console.error(`[GenerateDirect] Generation ${generationId} failed:`, error)
        console.error(`[GenerateDirect] Error type:`, typeof error)
        console.error(`[GenerateDirect] Error constructor:`, error?.constructor?.name)
        await updateGenerationFailed(generationId, errorMessage).catch(dbErr => {
          console.error(`[GenerateDirect] Failed to update DB with error:`, dbErr)
        })
      }
    })

    return NextResponse.json({
      success: true,
      generationId,
      runId: `direct-${generationId}`,
      message: "Video generation started (direct mode, no workflow)",
    })
  } catch (error) {
    console.error("GenerateDirect error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start video generation" },
      { status: 500 }
    )
  }
}

/**
 * Generate video and save to blob — runs directly in the route handler (no workflow step).
 * Uses the exact same pattern as shaper's working code.
 */
async function generateAndSaveVideoDirect(
  generationId: number,
  videoUrl: string,
  characterImageUrl: string,
): Promise<string> {
  try {
    console.log(`[GenerateDirect] [${new Date().toISOString()}] generateAndSaveVideoDirect starting for generation ${generationId}`)

    const { experimental_generateVideo: generateVideo, createGateway } = await import("ai")
    const { Agent, fetch: undiciFetch } = await import("undici")
    const { put } = await import("@vercel/blob")

    console.log(`[GenerateDirect] [${new Date().toISOString()}] Imports loaded successfully`)

    const stepStartTime = Date.now()

    // Use undici.fetch directly instead of global fetch
    // In Vercel, global fetch might be wrapped and ignore the dispatcher
    const longTimeoutAgent = new Agent({
      headersTimeout: 15 * 60 * 1000, // 15 minutes
      bodyTimeout: 15 * 60 * 1000, // 15 minutes
    })

    console.log(`[GenerateDirect] [${new Date().toISOString()}] Agent created with 15min timeouts`)

    const gateway = createGateway({
      fetch: (url, init) =>
        undiciFetch(url, { ...init, dispatcher: longTimeoutAgent }),
    })

    console.log(`[GenerateDirect] [${new Date().toISOString()}] Setup done (+${Date.now() - stepStartTime}ms)`)
    console.log(`[GenerateDirect] [${new Date().toISOString()}] characterImageUrl=${characterImageUrl}, videoUrl=${videoUrl}`)

  // Generate video using AI SDK with KlingAI motion control
  console.log(`[GenerateDirect] [${new Date().toISOString()}] Calling experimental_generateVideo...`)

  const generateStart = Date.now()
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
        pollTimeoutMs: 14 * 60 * 1000, // 14 minutes
      },
    },
  })

  const generateTime = Date.now() - generateStart
  console.log(`[GenerateDirect] [${new Date().toISOString()}] generateVideo completed in ${generateTime}ms (${(generateTime / 1000).toFixed(1)}s)`)
  console.log(`[GenerateDirect] [${new Date().toISOString()}] Generated ${result.videos.length} video(s)`)

  if (result.videos.length === 0) {
    throw new Error("No videos were generated")
  }

  // Save to Vercel Blob
  const videoBytes = result.videos[0].uint8Array
  console.log(`[GenerateDirect] [${new Date().toISOString()}] Video size: ${videoBytes.length} bytes, saving to Blob...`)

  const { url: blobUrl } = await put(`generations/${generationId}-${Date.now()}.mp4`, videoBytes, {
    access: "public",
    contentType: "video/mp4",
  })

    console.log(`[GenerateDirect] [${new Date().toISOString()}] Saved to blob: ${blobUrl}, total time: ${Date.now() - stepStartTime}ms`)
    return blobUrl
  } catch (error) {
    console.error(`[GenerateDirect] Error in generateAndSaveVideoDirect:`, error)
    console.error(`[GenerateDirect] Error type:`, typeof error)
    console.error(`[GenerateDirect] Error constructor:`, error?.constructor?.name)
    throw error
  }
}
