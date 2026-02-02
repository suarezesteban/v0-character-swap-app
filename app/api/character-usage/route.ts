import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const { characterId } = await request.json()
    
    if (!characterId) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 })
    }

    // Upsert: insert or update usage count
    await sql`
      INSERT INTO character_usage (character_id, usage_count, last_used_at)
      VALUES (${String(characterId)}, 1, NOW())
      ON CONFLICT (character_id) 
      DO UPDATE SET 
        usage_count = character_usage.usage_count + 1,
        last_used_at = NOW()
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error tracking character usage:", error)
    return NextResponse.json({ error: "Failed to track usage" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const usage = await sql`
      SELECT character_id, usage_count 
      FROM character_usage 
      ORDER BY usage_count DESC
    `

    // Convert to a map for easy lookup
    const usageMap: Record<string, number> = {}
    for (const row of usage) {
      usageMap[row.character_id] = row.usage_count
    }

    return NextResponse.json({ usage: usageMap })
  } catch (error) {
    console.error("Error fetching character usage:", error)
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 })
  }
}
