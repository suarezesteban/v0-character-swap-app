import { neon } from "@neondatabase/serverless"

export const sql = neon(process.env.DATABASE_URL!)

export interface Generation {
  id: number
  user_id: string
  user_email: string | null
  video_url: string | null
  source_video_url: string | null
  character_name: string | null
  character_image_url: string | null
  status: "uploading" | "processing" | "completed" | "failed" | "cancelled"
  run_id: string | null
  error_message: string | null
  created_at: Date
  completed_at: Date | null
}

export async function createGeneration(data: {
  userId: string
  userEmail?: string
  videoUrl: string
  characterName?: string
  characterImageUrl?: string
}) {
  const result = await sql`
    INSERT INTO generations (user_id, user_email, video_url, character_name, character_image_url, status)
    VALUES (${data.userId}, ${data.userEmail || null}, ${data.videoUrl}, ${data.characterName || null}, ${data.characterImageUrl || null}, 'processing')
    RETURNING id
  `
  return result[0]?.id
}

// Create a generation record immediately (before upload) with status "uploading"
export async function createPendingGeneration(data: {
  userId: string
  userEmail?: string
  characterName?: string
  characterImageUrl?: string
}) {
  const result = await sql`
    INSERT INTO generations (user_id, user_email, character_name, character_image_url, status)
    VALUES (${data.userId}, ${data.userEmail || null}, ${data.characterName || null}, ${data.characterImageUrl || null}, 'uploading')
    RETURNING id
  `
  return result[0]?.id
}

// Update generation after upload is complete, then start processing
export async function updateGenerationStartProcessing(id: number, videoUrl: string, characterImageUrl: string) {
  await sql`
    UPDATE generations 
    SET source_video_url = ${videoUrl}, character_image_url = ${characterImageUrl}, status = 'processing'
    WHERE id = ${id}
  `
}

export async function updateGenerationRunId(id: number, runId: string) {
  await sql`
    UPDATE generations 
    SET run_id = ${runId}
    WHERE id = ${id}
  `
}

export async function updateGenerationComplete(id: number, videoUrl: string) {
  await sql`
    UPDATE generations 
    SET status = 'completed', video_url = ${videoUrl}, completed_at = NOW()
    WHERE id = ${id}
  `
}

export async function updateGenerationFailed(id: number, errorMessage?: string) {
  await sql`
    UPDATE generations 
    SET status = 'failed', completed_at = NOW(), error_message = ${errorMessage || null}
    WHERE id = ${id}
  `
}

export async function getUserGenerations(userId: string): Promise<Generation[]> {
  const result = await sql`
    SELECT * FROM generations 
    WHERE user_id = ${userId} 
    ORDER BY created_at DESC
    LIMIT 50
  `
  return result as Generation[]
}

// Reference Images
export interface ReferenceImage {
  id: number
  user_id: string
  name: string
  image_url: string
  created_at: Date
}

export async function createReferenceImage(data: {
  userId: string
  name: string
  imageUrl: string
}): Promise<number> {
  const result = await sql`
    INSERT INTO reference_images (user_id, name, image_url)
    VALUES (${data.userId}, ${data.name}, ${data.imageUrl})
    RETURNING id
  `
  return result[0]?.id
}

export async function getUserReferenceImages(userId: string): Promise<ReferenceImage[]> {
  const result = await sql`
    SELECT * FROM reference_images 
    WHERE user_id = ${userId} 
    ORDER BY created_at DESC
  `
  return result as ReferenceImage[]
}

export async function deleteReferenceImage(id: number, userId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM reference_images 
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `
  return result.length > 0
}
