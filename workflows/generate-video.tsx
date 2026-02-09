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
 * Durable workflow for video generation using AI SDK + AI Gateway
 * 
 * Flow:
 * 1. Workflow calls generateVideo via AI SDK with KlingAI motion control
 * 2. AI SDK handles polling internally until video is ready
 * 3. Workflow saves the resulting video to Vercel Blob
 * 4. Workflow updates the database and sends email notification
 * 
 * No webhook needed - AI SDK handles the entire generation lifecycle.
 */
export async function generateVideoWorkflow(input: GenerateVideoInput) {
  "use workflow"

  const { generationId, videoUrl, characterImageUrl, characterName, userEmail } = input

  const workflowStartTime = Date.now()
  console.log(`[Workflow] [${new Date().toISOString()}] Starting generation ${generationId} via AI Gateway`)

  // Generate video using AI SDK + KlingAI motion control
  let videoData: Uint8Array
  try {
    const generateStartTime = Date.now()
    videoData = await generateVideoWithAISDK(generationId, videoUrl, characterImageUrl)
    const generateTime = Date.now() - generateStartTime
    console.log(`[Workflow] [${new Date().toISOString()}] Video generated in ${generateTime}ms (${(generateTime / 1000).toFixed(1)}s)`)
  } catch (genError) {
    console.error(`[Workflow] [${new Date().toISOString()}] Video generation failed:`, genError)
    const errorMessage = genError instanceof Error ? genError.message : String(genError)
    await markGenerationFailed(generationId, errorMessage)
    return { success: false, error: errorMessage }
  }

  // Save video to Vercel Blob
  const blobStartTime = Date.now()
  const blobUrl = await saveVideoToBlob(generationId, videoData)
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
  console.log(`[Workflow] [TIMING SUMMARY] Total: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`)
  return { success: true, videoUrl: blobUrl }
}

// ============================================
// STEP FUNCTIONS (have full Node.js access)
// ============================================

async function generateVideoWithAISDK(
  generationId: number,
  videoUrl: string,
  characterImageUrl: string,
): Promise<Uint8Array> {
  "use step"

  const stepStartTime = Date.now()
  console.log(`[Workflow Step] [${new Date().toISOString()}] generateVideoWithAISDK starting...`)

  const { experimental_generateVideo: generateVideo } = await import("ai")
  const { updateGenerationRunId } = await import("@/lib/db")
  const { Agent } = await import("undici")

  console.log(`[Workflow Step] [${new Date().toISOString()}] Imports done (+${Date.now() - stepStartTime}ms)`)
  console.log(`[Workflow Step] [${new Date().toISOString()}] Input: characterImageUrl=${characterImageUrl}, videoUrl=${videoUrl}`)

  // Download the character image to pass as bytes to AI SDK
  const imageStart = Date.now()
  const imageResponse = await fetch(characterImageUrl)
  if (!imageResponse.ok) {
    throw new Error(`Failed to download character image: ${imageResponse.status} ${imageResponse.statusText}`)
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  console.log(`[Workflow Step] [${new Date().toISOString()}] Character image downloaded in ${Date.now() - imageStart}ms, size: ${imageBuffer.length} bytes`)

  // Update run ID with a placeholder so UI knows it's processing
  await updateGenerationRunId(generationId, `ai-gateway-${generationId}`)

  // Generate video using AI SDK with KlingAI motion control via AI Gateway
  console.log(`[Workflow Step] [${new Date().toISOString()}] Calling experimental_generateVideo with klingai/kling-v2.6-motion-control...`)

  // Custom fetch with extended timeouts for video generation (can take 10+ minutes)
  const longTimeoutFetch = (url: string | URL | Request, init?: RequestInit) =>
    fetch(url, {
      ...init,
      dispatcher: new Agent({
        headersTimeout: 15 * 60 * 1000, // 15 minutes
        bodyTimeout: 15 * 60 * 1000,    // 15 minutes
      }),
    } as RequestInit)

  const generateStart = Date.now()
  const result = await generateVideo({
    model: "klingai/kling-v2.6-motion-control",
    prompt: {
      image: imageBuffer,
      text: "Perform the motion from the reference video",
    },
    providerOptions: {
      klingai: {
        // Reference motion video URL - the user's recorded video
        videoUrl: videoUrl,
        // Match orientation from the reference video
        characterOrientation: "video" as const,
        // Standard mode (cost-effective)
        mode: "std" as const,
        // Extended poll timeout since video generation takes minutes
        pollTimeoutMs: 12 * 60 * 1000, // 12 minutes
      },
    },
    fetch: longTimeoutFetch,
  })

  const generateTime = Date.now() - generateStart
  console.log(`[Workflow Step] [${new Date().toISOString()}] generateVideo completed in ${generateTime}ms (${(generateTime / 1000).toFixed(1)}s)`)
  console.log(`[Workflow Step] [${new Date().toISOString()}] Generated ${result.videos.length} video(s)`)

  if (result.videos.length === 0) {
    throw new Error("No videos were generated")
  }

  // Return the first video's raw bytes
  const videoBytes = result.videos[0].uint8Array
  console.log(`[Workflow Step] [${new Date().toISOString()}] Video size: ${videoBytes.length} bytes, total step time: ${Date.now() - stepStartTime}ms`)
  
  return videoBytes
}

async function saveVideoToBlob(generationId: number, videoData: Uint8Array): Promise<string> {
  "use step"

  const stepStartTime = Date.now()
  const { put } = await import("@vercel/blob")

  console.log(`[Workflow Step] [${new Date().toISOString()}] Saving ${videoData.length} bytes to Vercel Blob`)

  const putStartTime = Date.now()
  const { url } = await put(`generations/${generationId}-${Date.now()}.mp4`, videoData, {
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
      from: "v0 Face Swap <noreply@resend.dev>",
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
