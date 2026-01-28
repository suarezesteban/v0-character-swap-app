import { sleep } from "workflow"

/**
 * Input for the video generation workflow
 */
export interface GenerateVideoInput {
  generationId: number
  videoUrl: string
  characterImageUrl: string
  characterName?: string
  userEmail?: string
}

/**
 * Result from fal.ai webhook
 */
export interface FalWebhookResult {
  status: "OK" | "ERROR"
  request_id: string
  payload?: {
    video?: {
      url: string
    }
    detail?: Array<{ msg?: string; message?: string }>
  }
  error?: string
}

/**
 * Durable workflow for video generation using polling
 * 
 * Flow:
 * 1. Workflow submits job to fal.ai
 * 2. Workflow polls fal.ai every 30s until complete
 * 3. Workflow saves result to Blob and updates database
 * 4. Optional: Send email notification
 */
export async function generateVideoWorkflow(input: GenerateVideoInput) {
  "use workflow"

  const { generationId, videoUrl, characterImageUrl, characterName, userEmail } = input

  console.log(`[Workflow] Starting generation ${generationId}`)

  // Submit to fal.ai
  const requestId = await submitToFal(generationId, videoUrl, characterImageUrl)

  console.log(`[Workflow] Submitted to fal.ai (request_id: ${requestId}), polling for result...`)

  // Poll fal.ai directly instead of relying on webhooks
  // This is more reliable as webhooks can fail due to URL issues
  let falResult: FalWebhookResult | null = null
  
  const MAX_WAIT_TIME = 15 * 60 * 1000 // 15 minutes max
  const POLL_INTERVAL = 30 * 1000 // Poll every 30 seconds
  const startTime = Date.now()
  
  while (!falResult && (Date.now() - startTime) < MAX_WAIT_TIME) {
    // Poll fal.ai directly
    const polledResult = await pollFalStatus(requestId)
    if (polledResult) {
      console.log(`[Workflow] Got result from fal.ai: ${polledResult.status}`)
      falResult = polledResult
      break
    }
    
    // Wait before next poll
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    console.log(`[Workflow] Still processing... (${elapsed}s elapsed), waiting ${POLL_INTERVAL / 1000}s before next poll`)
    await sleep(POLL_INTERVAL)
  }
  
  // If still no result after timeout, mark as failed
  if (!falResult) {
    console.error(`[Workflow] Timeout waiting for fal.ai result after ${MAX_WAIT_TIME / 1000}s`)
    await markGenerationFailed(generationId, "Generation timed out - no response from AI service")
    return { success: false, error: "Generation timed out" }
  }

  console.log(`[Workflow] Received fal result:`, falResult.status)

  // Process the result
  if (falResult.status === "OK" && falResult.payload?.video?.url) {
    // Download and save to Blob
    const blobUrl = await saveVideoToBlob(generationId, falResult.payload.video.url)

    // Update database
    await markGenerationComplete(generationId, blobUrl)

    // Send email notification
    if (userEmail) {
      await sendCompletionEmail(userEmail, blobUrl, characterName)
    }

    console.log(`[Workflow] Generation ${generationId} completed: ${blobUrl}`)
    return { success: true, videoUrl: blobUrl }
  } else {
    // Handle failure
    let errorMessage = "Unknown error"

    if (falResult.payload?.detail?.length) {
      const detail = falResult.payload.detail[0]
      errorMessage = detail.msg || detail.message || falResult.error || "Validation error"
    } else {
      errorMessage = falResult.error || "Processing failed"
    }

    await markGenerationFailed(generationId, errorMessage)
    console.error(`[Workflow] Generation ${generationId} failed: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

// ============================================
// STEP FUNCTIONS (have full Node.js access)
// ============================================

/**
 * Poll fal.ai to check if the job is complete
 * Returns the result if complete, null if still processing
 */
async function pollFalStatus(requestId: string): Promise<FalWebhookResult | null> {
  "use step"

  const { fal } = await import("@fal-ai/client")

  fal.config({ credentials: process.env.FAL_KEY })

  try {
    const status = await fal.queue.status("fal-ai/kling-video/v2.6/standard/motion-control", {
      requestId,
      logs: true,
    })

    console.log(`[Workflow Step] Polled fal.ai status: ${status.status}`)

    if (status.status === "COMPLETED") {
      // Fetch the actual result
      const result = await fal.queue.result("fal-ai/kling-video/v2.6/standard/motion-control", {
        requestId,
      })

      return {
        status: "OK",
        request_id: requestId,
        payload: {
          video: result.data && typeof result.data === 'object' && 'video' in result.data
            ? (result.data as { video: { url: string } }).video
            : undefined,
        },
      }
    }

    if (status.status === "FAILED") {
      return {
        status: "ERROR",
        request_id: requestId,
        error: "Processing failed on fal.ai",
      }
    }

    // Still processing
    return null
  } catch (error) {
    console.error(`[Workflow Step] Error polling fal.ai:`, error)
    return null
  }
}

async function submitToFal(
  generationId: number,
  videoUrl: string,
  characterImageUrl: string
): Promise<string> {
  "use step"

  const { fal } = await import("@fal-ai/client")
  const { updateGenerationRunId } = await import("@/lib/db")

  fal.config({ credentials: process.env.FAL_KEY })

  console.log(`[Workflow Step] Submitting to fal.ai...`)

  const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.6/standard/motion-control", {
    input: {
      image_url: characterImageUrl,
      video_url: videoUrl,
      character_orientation: "video",
    },
  })

  await updateGenerationRunId(generationId, request_id)

  console.log(`[Workflow Step] Submitted, request_id: ${request_id}`)
  return request_id
}

async function saveVideoToBlob(generationId: number, falVideoUrl: string): Promise<string> {
  "use step"

  const { put } = await import("@vercel/blob")

  console.log(`[Workflow Step] Downloading video from fal...`)

  const response = await fetch(falVideoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`)
  }

  const videoBlob = await response.blob()
  const { url } = await put(`generations/${generationId}-${Date.now()}.mp4`, videoBlob, {
    access: "public",
    contentType: "video/mp4",
  })

  console.log(`[Workflow Step] Saved to blob: ${url}`)
  return url
}

async function markGenerationComplete(generationId: number, videoUrl: string): Promise<void> {
  "use step"

  const { updateGenerationComplete } = await import("@/lib/db")
  await updateGenerationComplete(generationId, videoUrl)
  console.log(`[Workflow Step] Marked generation ${generationId} as complete`)
}

async function markGenerationFailed(generationId: number, error: string): Promise<void> {
  "use step"

  const { updateGenerationFailed } = await import("@/lib/db")
  await updateGenerationFailed(generationId, error)
  console.log(`[Workflow Step] Marked generation ${generationId} as failed: ${error}`)
}

async function sendCompletionEmail(email: string, videoUrl: string, characterName?: string): Promise<void> {
  "use step"

  const { Resend } = await import("resend")

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: "SwapVid <noreply@resend.dev>",
      to: email,
      subject: "Your video is ready!",
      html: `
        <h1>Your face swap video is ready!</h1>
        ${characterName ? `<p>Character: ${characterName}</p>` : ""}
        <p>Click below to view your video:</p>
        <p><a href="${videoUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">View Video</a></p>
        <p style="margin-top:20px;color:#666;font-size:14px;">Or copy this link: ${videoUrl}</p>
      `,
    })
    console.log(`[Workflow Step] Email sent to ${email}`)
  } catch (error) {
    console.error("[Workflow Step] Failed to send email:", error)
  }
}
