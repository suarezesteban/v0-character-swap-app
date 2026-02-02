import type { Character, CharacterCategory } from "./types"

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
// Character Categories
// ===========================================

export const CHARACTER_CATEGORIES: { id: CharacterCategory | "all"; label: string }[] = [
  { id: "popular", label: "popular" },
  { id: "memes", label: "memes" },
  { id: "cartoons", label: "cartoons" },
  { id: "celebs", label: "celebs" },
  { id: "all", label: "all" },
]

// ===========================================
// Default Characters
// ===========================================

export const DEFAULT_CHARACTERS: Character[] = [
  { id: 1, src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/jdvance-oKoVK6voLTrIRvXMDVyb7Ixo1hiqOf.png", name: "JD Vance", category: "celebs" },
  { id: 2, src: "/characters/leodc.png", name: "Django", category: "celebs" },
  { id: 3, src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/aliens-rPpxM5sHYuGsDnqZcvSH8AWxQiTqXw.png", name: "Aliens", category: "memes" },
  { id: 4, src: "/characters/dolly.png", name: "Dolly Parton", category: "celebs" },
  { id: 5, src: "/characters/aubrey.png", name: "Aubrey Plaza", category: "celebs" },
  { id: 6, src: "/characters/donald.png", name: "Donald Trump", category: "celebs" },
  { id: 7, src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/think-gpwwAFDFK6EWZ8V7ckfg6Gze8YEV5W.png", name: "Think", category: "memes" },
  { id: 8, src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/nano-banana-pro-image-editing-result%20%2850%29-MKnUP5YDwDFujPEfusSQ5edL6x815s.png", name: "Einstein", category: "celebs" },
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
