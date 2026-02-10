import { type NextRequest, NextResponse } from "next/server"
import { createGeneration, updateGenerationStartProcessing } from "@/lib/db"

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

    // Fire-and-forget: call generate-video route (separate serverless fn with maxDuration=800)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    }

    fetch(`${baseUrl}/api/generate-video`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        generationId,
        videoUrl,
        characterImageUrl,
        characterName: characterName || undefined,
        userEmail: sendEmail ? userEmail : undefined,
      }),
    }).catch((err) => {
      console.error("[Generate] Failed to trigger background generation:", err)
    })

    return NextResponse.json({
      success: true,
      generationId,
      message: "Video generation started",
    })
  } catch (error) {
    console.error("Generate error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start video generation" },
      { status: 500 }
    )
  }
}
