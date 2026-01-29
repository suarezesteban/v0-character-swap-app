import { type NextRequest, NextResponse } from "next/server"
import { start } from "workflow/api"
import { createGeneration, updateGenerationStartProcessing } from "@/lib/db"
import { generateVideoWorkflow } from "@/workflows/generate-video"

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

    console.log("[v0] Starting generation:", { 
      generationId, 
      videoUrl, 
      characterImageUrl,
      characterName 
    })

    // Start the durable workflow using workflow/api
    // This returns immediately - the workflow runs in the background
    const run = await start(generateVideoWorkflow, [{
      generationId,
      videoUrl,
      characterImageUrl,
      characterName: characterName || undefined,
      userEmail: sendEmail ? userEmail : undefined,
    }])
    
    console.log("[v0] Workflow started:", { generationId, runId: run.runId })

    return NextResponse.json({
      success: true,
      generationId,
      runId: run.runId,
      message: "Video generation started",
    })
  } catch (error) {
    console.error("Generate error:", error)
    return NextResponse.json(
      { error: "Failed to start video generation" },
      { status: 500 }
    )
  }
}
