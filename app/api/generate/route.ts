import { type NextRequest, NextResponse } from "next/server"
import { createGeneration, updateGenerationStartProcessing, updateGenerationRunId, updateGenerationComplete, updateGenerationFailed } from "@/lib/db"
import { toWorkflowErrorObject } from "@/lib/workflow-errors"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { generationId: existingGenerationId, videoUrl, characterImageUrl, userId, userEmail, characterName, sendEmail } = body

    // Validate required fields
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

    // If we have an existing generation (created during upload), update it
    // Otherwise create a new one
    if (existingGenerationId) {
      await updateGenerationStartProcessing(existingGenerationId, videoUrl, characterImageUrl)
    } else {
      // Create generation record in database
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

    // Run video generation in the background using waitUntil
    // The route returns immediately while the generation continues
    const generationPromise = runVideoGeneration({
      generationId,
      videoUrl,
      characterImageUrl,
      characterName: characterName || undefined,
      userEmail: sendEmail ? userEmail : undefined,
    })

    // Use waitUntil if available (Vercel), otherwise fire-and-forget
    if (typeof globalThis !== "undefined" && "waitUntil" in globalThis) {
      // @ts-expect-error - waitUntil is available in Vercel runtime
      globalThis.waitUntil(generationPromise)
    } else {
      // In dev, just let it run in the background
      generationPromise.catch((err: unknown) => console.error("Background generation error:", err))
    }

    return NextResponse.json({
      success: true,
      generationId,
      message: "Video generation started",
    })
  } catch (error) {
    console.error("Generate error:", error)
    const message =
      error instanceof Error ? error.message : "Failed to start video generation"
    return NextResponse.json(
      { error: toWorkflowErrorObject(message) },
      { status: 500 }
    )
  }
}

const PROVIDER_ERROR_PREFIX = "WF_PROVIDER_ERROR::"

function buildProviderErrorPayload(details: string) {
  if (details.includes("GatewayInternalServerError")) {
    return {
      kind: "provider_error",
      provider: "kling",
      model: "klingai/kling-v2.6-motion-control",
      code: "GATEWAY_INTERNAL_SERVER_ERROR",
      summary: "AI Gateway/provider returned an internal server error.",
      details,
    }
  }
  return {
    kind: "provider_error",
    provider: "kling",
    model: "klingai/kling-v2.6-motion-control",
    code: "PROVIDER_ERROR",
    summary: "Provider request failed.",
    details,
  }
}

async function serializeUnknownError(error: unknown): Promise<string> {
  if (error instanceof Error) return error.stack ?? error.message
  if (typeof error === "string") return error
  try { return JSON.stringify(error) } catch { return String(error) }
}

async function runVideoGeneration(input: {
  generationId: number
  videoUrl: string
  characterImageUrl: string
  characterName?: string
  userEmail?: string
}) {
  const { generationId, videoUrl, characterImageUrl, characterName, userEmail } = input

  console.log(`[Generate] Starting generation ${generationId} via AI Gateway`)

  // Step 1: Generate video using AI SDK
  let videoData: Uint8Array
  try {
    const { experimental_generateVideo: generateVideo } = await import("ai")
    const { createGateway } = await import("@ai-sdk/gateway")
    const { Agent } = await import("undici")

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

    await updateGenerationRunId(generationId, `ai-gateway-${generationId}`)

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

    if (result.videos.length === 0) {
      throw new Error("No videos were generated")
    }

    videoData = result.videos[0].uint8Array
    console.log(`[Generate] Video generated: ${videoData.length} bytes`)
  } catch (error) {
    const details = await serializeUnknownError(error)
    const payload = buildProviderErrorPayload(details)
    const errorMessage = `${PROVIDER_ERROR_PREFIX}${JSON.stringify(payload)}`
    console.error(`[Generate] Video generation failed:`, errorMessage)
    await updateGenerationFailed(generationId, errorMessage)
    return
  }

  // Step 2: Save video to Vercel Blob
  try {
    const { put } = await import("@vercel/blob")
    const { url: blobUrl } = await put(`generations/${generationId}-${Date.now()}.mp4`, videoData, {
      access: "public",
      contentType: "video/mp4",
    })

    console.log(`[Generate] Saved to blob: ${blobUrl}`)

    // Step 3: Update database
    await updateGenerationComplete(generationId, blobUrl)

    // Step 4: Send email notification
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
        console.log(`[Generate] Email sent to ${userEmail}`)
      } catch (emailError) {
        console.error("[Generate] Failed to send email:", emailError)
      }
    }

    console.log(`[Generate] Generation ${generationId} completed successfully`)
  } catch (blobError) {
    console.error(`[Generate] Failed to save/complete generation:`, blobError)
    await updateGenerationFailed(generationId, blobError instanceof Error ? blobError.message : "Failed to save video")
  }
}
