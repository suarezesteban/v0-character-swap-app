import { type NextRequest, NextResponse } from "next/server"
import { deleteReferenceImage } from "@/lib/db"
import { verifySession } from "@/lib/auth"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const imageId = parseInt(id, 10)

    if (isNaN(imageId)) {
      return NextResponse.json({ error: "Invalid image ID" }, { status: 400 })
    }

    const deleted = await deleteReferenceImage(imageId, session.user.id)

    if (!deleted) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting reference image:", error)
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 })
  }
}
