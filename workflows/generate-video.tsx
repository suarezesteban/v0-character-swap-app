import { createHook } from "workflow"

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
 * Durable workflow for video generation using hooks (not polling!)
 * 
 * Flow:
 * 1. Workflow creates a hook with token `fal-generation-{generationId}`
 * 2. Workflow submits to fal.ai with our webhook URL
 * 3. Workflow suspends at `await hook` (ZERO resources consumed)
 * 4. fal.ai completes and calls /api/fal-webhook
 * 5. /api/fal-webhook calls resumeHook() to wake the workflow
 * 6. Workflow resumes and processes the result
 */
export async function generateVideoWorkflow(input: GenerateVideoInput) {
  "use workflow"

  const { generationId, videoUrl, characterImageUrl, characterName, userEmail } = input

  const workflowStartTime = Date.now()
  console.log(`[Workflow] [${new Date().toISOString()}] Starting generation ${generationId}`)

  // Create a hook with deterministic token so fal-webhook can resume it
  const hook = createHook<FalWebhookResult>({
    token: `fal-generation-${generationId}`,
  })

  console.log(`[Workflow] [${new Date().toISOString()}] Created hook with token: fal-generation-${generationId} (+${Date.now() - workflowStartTime}ms)`)

  // Submit to fal.ai - pass the hook token so fal-webhook knows which workflow to resume
  const submitStartTime = Date.now()
  const requestId = await submitToFal(generationId, videoUrl, characterImageUrl, hook.token)

  console.log(`[Workflow] [${new Date().toISOString()}] Submitted to fal.ai (request_id: ${requestId}), submitToFal took ${Date.now() - submitStartTime}ms, waiting for webhook...`)

  // SUSPEND HERE - workflow sleeps with ZERO resource consumption
  // until /api/fal-webhook calls resumeHook()
  const hookWaitStartTime = Date.now()
  const falResult = await hook
  const hookWaitTime = Date.now() - hookWaitStartTime

  console.log(`[Workflow] [${new Date().toISOString()}] Received fal result: ${falResult.status}, hook waited ${hookWaitTime}ms (${(hookWaitTime / 1000).toFixed(1)}s)`)

  // Process the result
  if (falResult.status === "OK" && falResult.payload?.video?.url) {
    // Save video to Blob (PiP disabled - ffmpeg.wasm doesn't work in Node.js)
    const blobStartTime = Date.now()
    const blobUrl = await saveVideoToBlob(generationId, falResult.payload.video.url)
    console.log(`[Workflow] [${new Date().toISOString()}] saveVideoToBlob took ${Date.now() - blobStartTime}ms`)

    // Update database
    const dbStartTime = Date.now()
    await markGenerationComplete(generationId, blobUrl)
    console.log(`[Workflow] [${new Date().toISOString()}] markGenerationComplete took ${Date.now() - dbStartTime}ms`)

    // Send email notification
    if (userEmail) {
      const emailStartTime = Date.now()
      await sendCompletionEmail(userEmail, blobUrl, characterName)
      console.log(`[Workflow] [${new Date().toISOString()}] sendCompletionEmail took ${Date.now() - emailStartTime}ms`)
    }

    const totalTime = Date.now() - workflowStartTime
    console.log(`[Workflow] [${new Date().toISOString()}] Generation ${generationId} completed: ${blobUrl}`)
    console.log(`[Workflow] [TIMING SUMMARY] Total: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s), Hook wait: ${hookWaitTime}ms (${(hookWaitTime / 1000).toFixed(1)}s)`)
    return { success: true, videoUrl: blobUrl }
  } else {
    // Handle failure - log full response for debugging
    console.error(`[Workflow] [${new Date().toISOString()}] Generation ${generationId} FAILED`)
    console.error(`[Workflow] Full fal result:`, JSON.stringify(falResult, null, 2))
    console.error(`[Workflow] Input videoUrl: ${videoUrl}`)
    console.error(`[Workflow] Input characterImageUrl: ${characterImageUrl}`)
    
    let errorMessage = "Unknown error"

    if (falResult.payload?.detail?.length) {
      const detail = falResult.payload.detail[0]
      errorMessage = detail.msg || detail.message || falResult.error || "Validation error"
      console.error(`[Workflow] Error detail:`, JSON.stringify(detail, null, 2))
    } else if (falResult.error) {
      errorMessage = falResult.error
    }

    await markGenerationFailed(generationId, errorMessage)
    console.error(`[Workflow] Final error message: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

// ============================================
// STEP FUNCTIONS (have full Node.js access)
// ============================================

async function submitToFal(
  generationId: number,
  videoUrl: string,
  characterImageUrl: string,
  hookToken: string
): Promise<string> {
  "use step"

  const stepStartTime = Date.now()
  console.log(`[Workflow Step] [${new Date().toISOString()}] submitToFal starting...`)

  const { fal } = await import("@fal-ai/client")
  const { updateGenerationRunId } = await import("@/lib/db")
  console.log(`[Workflow Step] [${new Date().toISOString()}] Imports done (+${Date.now() - stepStartTime}ms)`)

  fal.config({ credentials: process.env.FAL_KEY })

  // ALWAYS upload to fal.storage for consistent format handling
  // fal.storage handles format conversion and ensures compatibility with Kling
  // This works for both WebM (Chrome/Safari 18.4+) and MP4 (older Safari)
  console.log(`[Workflow Step] [${new Date().toISOString()}] Uploading video to fal.storage for consistent format handling...`)
  
  const videoFetchStart = Date.now()
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.status}`)
  }
  const videoBlob = await videoResponse.blob()
  console.log(`[Workflow Step] [${new Date().toISOString()}] Video downloaded in ${Date.now() - videoFetchStart}ms, size: ${videoBlob.size} bytes, type: ${videoBlob.type}`)

  const falUploadStart = Date.now()
  const finalVideoUrl = await fal.storage.upload(videoBlob)
  console.log(`[Workflow Step] [${new Date().toISOString()}] fal.storage.upload took ${Date.now() - falUploadStart}ms, url: ${finalVideoUrl}`)

  // Build our webhook URL with both generationId and hookToken
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const webhookUrl = `${baseUrl}/api/fal-webhook?generationId=${generationId}&hookToken=${hookToken}`

  console.log(`[Workflow Step] [${new Date().toISOString()}] Submitting to fal.ai with webhook: ${webhookUrl}`)
  console.log(`[Workflow Step] [${new Date().toISOString()}] Input: image_url=${characterImageUrl}, video_url=${finalVideoUrl}`)

  const falSubmitStart = Date.now()
  const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.6/standard/motion-control", {
    input: {
      image_url: characterImageUrl,
      video_url: finalVideoUrl,
      character_orientation: "video",
    },
    webhookUrl,
  })
  console.log(`[Workflow Step] [${new Date().toISOString()}] fal.queue.submit took ${Date.now() - falSubmitStart}ms`)

  const dbUpdateStart = Date.now()
  await updateGenerationRunId(generationId, request_id)
  console.log(`[Workflow Step] [${new Date().toISOString()}] updateGenerationRunId took ${Date.now() - dbUpdateStart}ms`)

  console.log(`[Workflow Step] [${new Date().toISOString()}] Submitted, request_id: ${request_id}, total step time: ${Date.now() - stepStartTime}ms`)
  return request_id
}

async function saveVideoToBlob(generationId: number, falVideoUrl: string): Promise<string> {
  "use step"

  const stepStartTime = Date.now()
  const { put } = await import("@vercel/blob")

  console.log(`[Workflow Step] [${new Date().toISOString()}] Downloading video from fal: ${falVideoUrl}`)

  const fetchStartTime = Date.now()
  const response = await fetch(falVideoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`)
  }
  console.log(`[Workflow Step] [${new Date().toISOString()}] fetch() took ${Date.now() - fetchStartTime}ms, status: ${response.status}`)

  const blobConvertStart = Date.now()
  const videoBlob = await response.blob()
  console.log(`[Workflow Step] [${new Date().toISOString()}] response.blob() took ${Date.now() - blobConvertStart}ms, size: ${videoBlob.size} bytes`)

  const putStartTime = Date.now()
  const { url } = await put(`generations/${generationId}-${Date.now()}.mp4`, videoBlob, {
    access: "public",
    contentType: "video/mp4",
  })
  console.log(`[Workflow Step] [${new Date().toISOString()}] put() to Vercel Blob took ${Date.now() - putStartTime}ms`)

  console.log(`[Workflow Step] [${new Date().toISOString()}] Saved to blob: ${url}, total step time: ${Date.now() - stepStartTime}ms`)
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
