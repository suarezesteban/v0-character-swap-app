// ===========================================
// User Types
// ===========================================

export interface User {
  id: string
  email?: string
  name?: string
  avatar?: string
}

// ===========================================
// Character Types
// ===========================================

export interface Character {
  id: number
  src: string
  name: string
  dbId?: number // Database ID for custom/user-uploaded characters
}

// ===========================================
// Video Generation Types
// ===========================================

export interface WorkflowStatus {
  step: "starting" | "uploading" | "generating" | "processing" | "complete" | "error"
  message: string
  progress: number
}

export interface GenerationRecord {
  id: number
  user_id: string
  video_url: string
  character_name?: string
  character_image_url?: string
  result_url?: string
  status: "uploading" | "pending" | "processing" | "completed" | "failed"
  error_message?: string
  created_at: string
  updated_at: string
}

// ===========================================
// API Response Types
// ===========================================

export interface ReferenceImage {
  id: number
  name: string
  image_url: string
}

export interface ReferenceImagesResponse {
  images: ReferenceImage[]
}

export interface GenerateResponse {
  success: boolean
  generationId?: number
  error?: string
}
