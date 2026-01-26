import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"
import { updateGenerationFailed } from "@/lib/db"

const sql = neon(process.env.DATABASE_URL!)

// Update generation status (e.g., mark as failed)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const generationId = parseInt(id, 10)

    if (isNaN(generationId)) {
      return NextResponse.json({ error: "Invalid generation ID" }, { status: 400 })
    }

    const { status, errorMessage } = await request.json()

    // Verify ownership first
    const ownership = await sql`
      SELECT id FROM generations 
      WHERE id = ${generationId} AND user_id = ${session.user.id}
    `
    
    if (ownership.length === 0) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 })
    }

    if (status === "failed") {
      await updateGenerationFailed(generationId, errorMessage)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update generation:", error)
    return NextResponse.json(
      { error: "Failed to update generation" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const generationId = parseInt(id, 10)

    if (isNaN(generationId)) {
      return NextResponse.json({ error: "Invalid generation ID" }, { status: 400 })
    }

    // Delete the generation (user can only delete their own)
    const result = await sql`
      DELETE FROM generations 
      WHERE id = ${generationId} 
        AND user_id = ${session.user.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to cancel generation:", error)
    return NextResponse.json(
      { error: "Failed to cancel generation" },
      { status: 500 }
    )
  }
}
