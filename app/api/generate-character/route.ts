import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    // Use AI Gateway with Nano Banana Pro (google/gemini-3-pro-image)
    // Optimized prompt for face swap compatibility - needs clear frontal face AND visible upper body
    const result = await generateText({
      model: "google/gemini-3-pro-image",
      prompt: `Professional portrait photograph of ${prompt}. 
CRITICAL REQUIREMENTS for face swap compatibility:
- Full head and complete upper body (shoulders, chest, arms) must be clearly visible in frame
- Face looking directly at camera, frontal view, no profile angles
- Face completely unobstructed - no sunglasses, masks, hands covering face, or hair covering face
- Even, soft lighting on face with no harsh shadows
- Sharp focus on facial features
- Photorealistic style, like a real photograph
- Subject should be standing or sitting with relaxed pose
- Plain or softly blurred background
- The person should appear from head to at least waist level`,
    })

    const imageFile = result.files?.find((f) => f.mediaType?.startsWith("image/"))

    if (!imageFile) {
      throw new Error("No image generated")
    }

    const base64 = Buffer.from(imageFile.uint8Array).toString("base64")
    const imageUrl = `data:${imageFile.mediaType};base64,${base64}`

    return NextResponse.json({ imageUrl })
  } catch (error: unknown) {
    console.error("Generate character error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to generate character" },
      { status: 500 }
    )
  }
}
