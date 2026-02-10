import { NextResponse } from "next/server"
import { getUserGenerations, createPendingGeneration } from "@/lib/db"
import { verifySession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await verifySession()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const generations = await getUserGenerations(session.user.id)

    return NextResponse.json({ generations }, {
      headers: {
        'Cache-Control': 'private, max-age=0, stale-while-revalidate=10',
      }
    })
  } catch (error) {
    console.error("Failed to fetch generations:", error)
    return NextResponse.json(
      { error: "Failed to fetch generations" },
      { status: 500 }
    )
  }
}

// Create a pending generation (before upload starts)
export async function POST(request: Request) {
  try {
    const session = await verifySession()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { characterName, characterImageUrl, aspectRatio, sourceVideoAspectRatio } = await request.json()

    const generationId = await createPendingGeneration({
      userId: session.user.id,
      userEmail: session.user.email,
      characterName,
      characterImageUrl,
      aspectRatio: aspectRatio || "fill",
      sourceVideoAspectRatio: sourceVideoAspectRatio || "fill",
    })

    return NextResponse.json({ generationId })
  } catch (error) {
    console.error("Failed to create pending generation:", error)
    return NextResponse.json(
      { error: "Failed to create generation" },
      { status: 500 }
    )
  }
}
