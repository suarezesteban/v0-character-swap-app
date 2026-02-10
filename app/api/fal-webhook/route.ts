import { type NextRequest, NextResponse } from "next/server"

/**
 * Legacy webhook endpoint for fal.ai callbacks
 * Now using direct API route for video generation, but keeping this
 * for any in-flight fal.ai jobs that may still call back.
 */
export async function POST(request: NextRequest) {
  try {
    const generationId = request.nextUrl.searchParams.get("generationId")

    if (!generationId) {
      return NextResponse.json({ error: "Missing generationId" }, { status: 400 })
    }

    const body = await request.json()
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
