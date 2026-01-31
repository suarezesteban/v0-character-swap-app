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
      onUploadCompleted: async ({ blob }) => {
        console.log(`[v0] Video uploaded: ${blob.pathname}, size: ${blob.size} bytes, contentType: ${blob.contentType}`)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
