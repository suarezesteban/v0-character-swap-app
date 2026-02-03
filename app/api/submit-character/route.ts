import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const { imageUrl, category, userId, name } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL required" }, { status: 400 })
    }

    await sql`
      INSERT INTO character_submissions (image_url, suggested_name, suggested_category, user_id)
      VALUES (${imageUrl}, ${name || null}, ${category || null}, ${userId || null})
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to submit character:", error)
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 })
  }
}
