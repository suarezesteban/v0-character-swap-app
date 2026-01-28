import { type NextRequest, NextResponse } from "next/server"
import { resumeHook } from "workflow/api"
import type { FalWebhookResult } from "@/workflows/generate-video"

/**
 * Webhook endpoint called by fal.ai when video generation completes
 *
 * This endpoint bridges fal.ai webhooks with Vercel Workflow:
 * 1. fal.ai calls this endpoint when processing completes
 * 2. We extract the hookToken from the query params
 * 3. We call resumeHook() to wake up the waiting workflow
 * 4. The workflow then handles saving to Blob, updating DB, sending email
 *
 * fal.ai sends:
 * - status: "OK" or "ERROR"
 * - request_id: the fal job id
 * - payload: { video: { url: string } } on success
 * - error: string on failure
 */
export async function POST(request: NextRequest) {
  const webhookReceivedTime = Date.now()
  
  try {
    const generationId = request.nextUrl.searchParams.get("generationId")
    const hookToken = request.nextUrl.searchParams.get("hookToken")

    console.log(`[fal-webhook] [${new Date().toISOString()}] Received callback for generation ${generationId}, hookToken: ${hookToken}`)

    if (!generationId) {
      console.error("[fal-webhook] Missing generationId")
      return NextResponse.json({ error: "Missing generationId" }, { status: 400 })
    }

    const bodyParseStart = Date.now()
    const body = await request.json()
    console.log(`[fal-webhook] [${new Date().toISOString()}] Body parsed in ${Date.now() - bodyParseStart}ms:`, JSON.stringify(body, null, 2))

    // If we have a hookToken, resume the workflow
    if (hookToken) {
      try {
        // Build the FalWebhookResult to send to the workflow
        const falResult: FalWebhookResult = {
          status: body.status,
          request_id: body.request_id,
          payload: body.payload,
          error: body.error,
        }

        console.log(`[fal-webhook] [${new Date().toISOString()}] About to resume workflow with token: ${hookToken}`)

        // This wakes up the workflow that's waiting at `await hook`
        const resumeStart = Date.now()
        const result = await resumeHook(hookToken, falResult)
        const resumeTime = Date.now() - resumeStart

        console.log(`[fal-webhook] [${new Date().toISOString()}] Workflow resumed successfully, runId: ${result.runId}, resumeHook took ${resumeTime}ms`)
        console.log(`[fal-webhook] [TIMING] Total webhook processing: ${Date.now() - webhookReceivedTime}ms`)

        return NextResponse.json({
          received: true,
          workflowResumed: true,
          runId: result.runId,
        })
      } catch (resumeError) {
        console.error(`[fal-webhook] [${new Date().toISOString()}] Failed to resume workflow:`, resumeError)

        // If workflow resume fails, fall back to direct processing
        // This handles cases where the workflow might have timed out or failed
        return await handleDirectProcessing(generationId, body)
      }
    }

    // No hookToken = old-style webhook (before workflow integration)
    // Fall back to direct processing
    console.log(`[fal-webhook] No hookToken, using direct processing`)
    return await handleDirectProcessing(generationId, body)
  } catch (error) {
    console.error("[fal-webhook] Error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

/**
 * Fallback: Direct processing without workflow
 * Used when hookToken is missing or workflow resume fails
 */
interface FalWebhookBody {
  status: "OK" | "ERROR"
  request_id: string
  payload?: {
    video?: { url: string }
    detail?: Array<{ msg?: string; message?: string }>
  }
  error?: string
  error_details?: string
  message?: string
}

async function handleDirectProcessing(generationId: string, body: FalWebhookBody) {
  const { put } = await import("@vercel/blob")
  const { sql, updateGenerationComplete, updateGenerationFailed } = await import("@/lib/db")
  const { Resend } = await import("resend")

  const { status, request_id, payload, error } = body

  // Handle failure
  if (status === "ERROR" || !payload?.video?.url) {
    let errorMessage = "Unknown error"

    if (payload?.detail && Array.isArray(payload.detail) && payload.detail.length > 0) {
      const detail = payload.detail[0]
      errorMessage = detail.msg || detail.message || error || "Validation error"
    } else {
      errorMessage = error || body?.error_details || body?.message || "Processing failed"
    }

    console.error(`[fal-webhook] Direct processing: generation ${generationId} failed: ${errorMessage}`)
    await updateGenerationFailed(Number(generationId), errorMessage)
    return NextResponse.json({ received: true, status: "failed", error: errorMessage })
  }

  // Get the video URL from fal
  const falVideoUrl = payload.video.url

  // Download and save to Vercel Blob for permanent storage
  const videoResponse = await fetch(falVideoUrl)
  if (!videoResponse.ok) {
    console.error(`[fal-webhook] Direct processing: Failed to fetch video from fal: ${videoResponse.status}`)
    await updateGenerationFailed(Number(generationId))
    return NextResponse.json({ received: true, status: "failed" })
  }

  const videoBlob = await videoResponse.blob()
  const { url: blobUrl } = await put(`generations/${request_id}.mp4`, videoBlob, {
    access: "public",
    contentType: "video/mp4",
  })

  // Update database with completed status and video URL
  await updateGenerationComplete(Number(generationId), blobUrl)

  // Get generation details to check if we need to send email
  const generations = await sql`
    SELECT user_email, character_name FROM generations WHERE id = ${Number(generationId)}
  `
  const generation = generations[0]

  // Send email notification if user opted in
  if (generation?.user_email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: "Face Swap <noreply@resend.dev>",
        to: generation.user_email,
        subject: "Your video is ready!",
        html: `
          <h1>Your face swap video is ready!</h1>
          ${generation.character_name ? `<p>Character: ${generation.character_name}</p>` : ""}
          <p>Click below to view your video:</p>
          <p><a href="${blobUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">View Video</a></p>
          <p style="margin-top:20px;color:#666;font-size:14px;">Or copy this link: ${blobUrl}</p>
        `,
      })
      console.log(`[fal-webhook] Direct processing: Email sent to ${generation.user_email}`)
    } catch (emailError) {
      console.error("[fal-webhook] Direct processing: Failed to send email:", emailError)
    }
  }

  return NextResponse.json({ received: true, status: "completed", videoUrl: blobUrl })
}

// Also handle GET for webhook verification (some services require this)
export async function GET() {
  return NextResponse.json({ status: "ok" })
}
