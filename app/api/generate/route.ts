import { type NextRequest, NextResponse } from "next/server"
import { start } from "workflow/api"
import { generateVideoWorkflow } from "@/workflows/generate-video"
import { createGeneration, updateGenerationStartProcessing, updateGenerationRunId } from "@/lib/db"
import { toWorkflowErrorObject } from "@/lib/workflow-errors"

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

    // Start the durable workflow via the Workflow SDK
    // Each step runs on its own request, avoiding the 5-minute serverless timeout
    // The .well-known/workflow/v1/step route has maxDuration=800 via vercel.json
    const run = await start(generateVideoWorkflow, [{
      generationId,
      videoUrl,
      characterImageUrl,
      characterName: characterName || undefined,
      userEmail: sendEmail ? userEmail : undefined,
    }])

    // Store the workflow run ID so the UI can track progress
    await updateGenerationRunId(generationId, run.id)

    console.log(`[Generate] Started workflow run ${run.id} for generation ${generationId}`)

    return NextResponse.json({
      success: true,
      generationId,
      runId: run.id,
      message: "Video generation workflow started",
    })
  } catch (error) {
    console.error("Generate error:", error)
    const message = error instanceof Error ? error.message : "Failed to start video generation"
    return NextResponse.json(
      { error: toWorkflowErrorObject(message) },
      { status: 500 }
    )
  }
}
