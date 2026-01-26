import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Allow video and image uploads
        return {
          allowedContentTypes: [
            "video/webm",
            "video/mp4",
            "video/quicktime",
            "image/jpeg",
            "image/png",
            "image/webp",
          ],
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // Upload completed - nothing to do here
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
