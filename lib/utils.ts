import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Detect aspect ratio from an image URL
 * Returns common aspect ratio strings: "9:16", "3:4", "1:1", "4:3", "16:9"
 */
export function detectImageAspectRatio(src: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve("1:1")
      return
    }
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const ratio = img.width / img.height
      if (ratio < 0.65) {
        resolve("9:16")
      } else if (ratio >= 0.65 && ratio < 0.85) {
        resolve("3:4")
      } else if (ratio >= 0.85 && ratio < 1.15) {
        resolve("1:1")
      } else if (ratio >= 1.15 && ratio < 1.5) {
        resolve("4:3")
      } else {
        resolve("16:9")
      }
    }
    img.onerror = () => resolve("1:1")
    img.src = src
  })
}

/**
 * Detect video aspect ratio from dimensions
 * Returns: "9:16" (portrait), "16:9" (landscape), or "fill" (square-ish)
 */
export function detectVideoAspectRatio(width: number, height: number): "9:16" | "16:9" | "fill" {
  const ratio = width / height
  if (ratio < 0.7) {
    return "9:16" // Portrait
  } else if (ratio > 1.4) {
    return "16:9" // Landscape
  }
  return "fill" // Square-ish
}
