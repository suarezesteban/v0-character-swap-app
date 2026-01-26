import { type NextRequest, NextResponse } from "next/server"
import { createReferenceImage, getUserReferenceImages } from "@/lib/db"
import { verifySession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await verifySession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const images = await getUserReferenceImages(session.user.id)
    return NextResponse.json({ images })
  } catch (error) {
    console.error("Error fetching reference images:", error)
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, imageUrl } = await request.json()

    if (!name || !imageUrl) {
      return NextResponse.json({ error: "Name and image URL are required" }, { status: 400 })
    }

    const id = await createReferenceImage({
      userId: session.user.id,
      name,
      imageUrl,
    })

    return NextResponse.json({ id, name, imageUrl })
  } catch (error) {
    console.error("Error creating reference image:", error)
    return NextResponse.json({ error: "Failed to create image" }, { status: 500 })
  }
}
