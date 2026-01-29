import type { Character } from "./types"

// ===========================================
// Video Constraints
// ===========================================

export const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB
export const MAX_VIDEO_DURATION = 30 // seconds - fal.ai limit
export const MIN_VIDEO_DURATION = 3 // seconds - fal.ai requirement

// ===========================================
// Image Constraints
// ===========================================

export const MIN_IMAGE_DIMENSION = 340 // pixels - fal.ai minimum

// ===========================================
// Default Characters
// ===========================================

export const DEFAULT_CHARACTERS: Character[] = [
  { id: 1, src: "/characters/rauch.png", name: "Rauchg" },
  { id: 2, src: "/characters/leo.png", name: "Django" },
  { id: 3, src: "/characters/bernie.png", name: "Bernie" },
  { id: 4, src: "/characters/think.png", name: "Think" },
  { id: 5, src: "/characters/aliens.png", name: "Aliens" },
  { id: 6, src: "/characters/jdvance.png", name: "JD Vance" },
]

// Alias for backwards compatibility
export const defaultCharacters = DEFAULT_CHARACTERS

// ===========================================
// Storage Keys
// ===========================================

export const STORAGE_KEYS = {
  HIDDEN_CHARACTERS: "hiddenDefaultCharacters",
  PENDING_CHARACTER: "pendingCharacter",
  PENDING_VIDEO_URL: "pendingVideoUrl",
  PENDING_UPLOADED: "pendingUploaded",
  PENDING_AUTO_SUBMIT: "pendingAutoSubmit",
  PENDING_ASPECT_RATIO: "pendingAspectRatio",
} as const

// ===========================================
// Custom Character ID Offset
// ===========================================

// Offset added to database IDs to avoid collision with default characters
export const CUSTOM_CHARACTER_ID_OFFSET = 1000
