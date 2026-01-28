import { type NextRequest, NextResponse } from "next/server"
import { fal } from "@fal-ai/client"

fal.config({ credentials: process.env.FAL_KEY })

/**
 * Check the status of a fal.ai request
 * This is useful for debugging when webhooks don't arrive
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 })
    }

    console.log(`[fal-status] Checking status for request: ${requestId}`)

    // Get the status from fal.ai
    const status = await fal.queue.status("fal-ai/kling-video/v2.6/standard/motion-control", {
      requestId,
      logs: true,
    })

    console.log(`[fal-status] Status for ${requestId}:`, JSON.stringify(status, null, 2))

    return NextResponse.json({
      requestId,
      status: status.status,
      logs: status.logs,
      queuePosition: status.queue_position,
    })
  } catch (error) {
    console.error("[fal-status] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get status" },
      { status: 500 }
    )
  }
}
