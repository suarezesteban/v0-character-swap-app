"use client"

import React, { useRef, useState, useEffect } from "react"
import Image from "next/image"
import { cn, detectImageAspectRatio } from "@/lib/utils"
import { upload } from "@vercel/blob/client"
import type { Character, CharacterCategory } from "@/lib/types"
import { defaultCharacters, CHARACTER_CATEGORIES } from "@/lib/constants"

// Re-export for backwards compatibility
export { defaultCharacters }
export type { Character }

interface CharacterGridProps {
  selectedId: number | null
  onSelect: (id: number) => void
  disabled?: boolean
  customCharacters: Character[]
  onAddCustom: (character: Character) => void
  onDeleteCustom?: (id: number) => void
  hiddenDefaultIds?: number[]
  onHideDefault?: (id: number) => void
  onExpand?: (imageUrl: string, characterId: number, isCustom: boolean) => void
  children?: React.ReactNode
  // Generate video CTA props
  canGenerate?: boolean
  hasVideo?: boolean
  hasCharacter?: boolean
  onGenerate?: () => void
  // Category filter props
  selectedCategory?: CharacterCategory | "all"
  onCategoryChange?: (category: CharacterCategory | "all") => void
  filteredCharacters?: Character[]
  onUpdateCharacterCategory?: (characterId: number, category: CharacterCategory) => void
}

export function CharacterGrid({ 
  selectedId, 
  onSelect, 
  disabled = false, 
  customCharacters, 
  onAddCustom,
  onDeleteCustom,
  hiddenDefaultIds = [],
  onHideDefault,
  onExpand,
  children,
  canGenerate = false,
  hasVideo = false,
  hasCharacter = false,
  onGenerate,
  selectedCategory = "popular",
  onCategoryChange,
  filteredCharacters: externalFilteredCharacters,
  onUpdateCharacterCategory,
}: CharacterGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  
  const visibleDefaultCharacters = defaultCharacters.filter(c => !hiddenDefaultIds.includes(c.id))
  const allCharacters = [...visibleDefaultCharacters, ...customCharacters]
  
  // Use external filtered characters if provided, otherwise use all
  const displayCharacters = externalFilteredCharacters || allCharacters
  
  // Track detected aspect ratios for each character image
  const [aspectRatios, setAspectRatios] = useState<Record<number, string>>({})
  
  // Detect aspect ratios for all display characters (includes approved from community)
  useEffect(() => {
    displayCharacters.forEach(async (char) => {
      if (!aspectRatios[char.id] && char.src) {
        const ar = await detectImageAspectRatio(char.src)
        console.log("[v0] Detected aspect ratio for", char.name, char.id, ":", ar)
        setAspectRatios(prev => ({ ...prev, [char.id]: ar }))
      }
    })
  }, [displayCharacters, aspectRatios])

  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showUploadTooltip, setShowUploadTooltip] = useState(false)
  const [recentlyUploadedUrl, setRecentlyUploadedUrl] = useState<string | null>(null)
  const [recentlyUploadedId, setRecentlyUploadedId] = useState<number | null>(null)
  const [showSubmitPrompt, setShowSubmitPrompt] = useState(false)
  const [showCategorySelect, setShowCategorySelect] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingCategory, setSubmittingCategory] = useState<CharacterCategory | null>(null)
  const [submitDone, setSubmitDone] = useState(false)
  const [characterName, setCharacterName] = useState("")
  const [showNameInput, setShowNameInput] = useState(false)

  // Validate image dimensions (min 340x340 for fal.ai)
  const validateImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => {
        URL.revokeObjectURL(img.src)
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(img.src)
        reject(new Error("Failed to load image"))
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const processFile = async (file: File) => {
    setUploadError(null)
    setIsUploading(true)
    
    try {
      // Validate dimensions first
      const dimensions = await validateImageDimensions(file)
      if (dimensions.width < 340 || dimensions.height < 340) {
        setUploadError(`Image too small (${dimensions.width}x${dimensions.height}). Minimum is 340x340 pixels.`)
        setIsUploading(false)
        return
      }

      // Upload to Vercel Blob
      const blob = await upload(`reference-images/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      })
      
      const newId = Math.max(...allCharacters.map(c => c.id), 0) + 1
      onAddCustom({ id: newId, src: blob.url, name: `Custom ${customCharacters.length + 1}` })
      
      // Show submit prompt after successful upload
      setRecentlyUploadedUrl(blob.url)
      setRecentlyUploadedId(newId)
      setShowSubmitPrompt(true)
    } catch (error) {
      console.error("Failed to upload image:", error)
      setUploadError("Failed to upload image")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return
    
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith("image/")) {
      processFile(file)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
      e.target.value = ""
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return

    setIsGenerating(true)
    setGenerationProgress(0)
    
    const duration = 20000 // 20 seconds to reach 95%
    const startTime = Date.now()
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min((elapsed / duration) * 95, 95) // Max 95%, stays there until image arrives
      setGenerationProgress(progress)
    }, 100)

    try {
      const response = await fetch("/api/generate-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })

      const data = await response.json()

      clearInterval(progressInterval)
      setGenerationProgress(100)

      if (data.imageUrl) {
        // Upload generated image to Blob for persistence
        let finalUrl = data.imageUrl
        try {
          // Convert base64 to blob and upload
          if (data.imageUrl.startsWith("data:")) {
            const res = await fetch(data.imageUrl)
            const blob = await res.blob()
            const uploaded = await upload(`reference-images/${Date.now()}-generated.png`, blob, {
              access: "public",
              handleUploadUrl: "/api/upload",
            })
            finalUrl = uploaded.url
          }
        } catch {
          // Use original URL if upload fails
        }
        
        const newId = Math.max(...allCharacters.map(c => c.id), 0) + 1
        onAddCustom({ id: newId, src: finalUrl, name: prompt.trim().slice(0, 20) })
        setPrompt("")
        onSelect(newId)
      }
    } catch (error) {
      console.error("Failed to generate:", error)
      clearInterval(progressInterval)
    } finally {
      setTimeout(() => {
        setIsGenerating(false)
        setGenerationProgress(0)
      }, 300)
    }
  }

  const handleSubmitToGallery = async (category: CharacterCategory) => {
    if (!recentlyUploadedUrl || isSubmitting || !characterName.trim()) return
    
    setIsSubmitting(true)
    setSubmittingCategory(category)
    try {
      await fetch("/api/submit-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imageUrl: recentlyUploadedUrl, 
          category,
          name: characterName.trim()
        }),
      })
      
      // Update the custom character's category locally so it appears in filtered view
      if (recentlyUploadedId && onUpdateCharacterCategory) {
        onUpdateCharacterCategory(recentlyUploadedId, category)
      }
      
      setSubmitDone(true)
      // Auto dismiss after showing "done"
      setTimeout(() => {
        dismissSubmitPrompt()
      }, 1500)
    } catch (error) {
      console.error("Failed to submit:", error)
    } finally {
      setIsSubmitting(false)
      setSubmittingCategory(null)
    }
  }

  const dismissSubmitPrompt = () => {
    setShowSubmitPrompt(false)
    setShowCategorySelect(false)
    setShowNameInput(false)
    setRecentlyUploadedUrl(null)
    setRecentlyUploadedId(null)
    setSubmitDone(false)
    setCharacterName("")
  }

  return (
    <div 
      className={cn(
        "relative flex max-h-full flex-col",
        isDragOver && "ring-2 ring-white/30"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/90">
          <div className="flex flex-col items-center gap-2 text-white">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="font-sans text-[13px] font-medium">Drop image here</span>
          </div>
        </div>
      )}
      
      <div className="shrink overflow-y-auto md:min-h-0 md:flex-1">
        <p className="mb-2 font-mono text-[10px] lowercase text-neutral-500 md:mb-3 md:text-[11px]">
          select character
        </p>
        
        {/* Category tabs */}
        {onCategoryChange && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CHARACTER_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-mono text-[10px] transition-all",
                  selectedCategory === cat.id
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
        
        {/* Grid container - flex wrap with fixed height */}
        <div className="pb-1 pt-1">
          <div className="flex flex-wrap gap-1.5 md:gap-3">
          {displayCharacters.map((char) => {
            const isCustom = customCharacters.some(c => c.id === char.id)
            const isDefault = visibleDefaultCharacters.some(c => c.id === char.id)
            const canDelete = (isCustom && onDeleteCustom) || (isDefault && onHideDefault)
            const ar = aspectRatios[char.id] || "1:1" // Default to square while loading
            // Calculate width based on aspect ratio (height is fixed at 50px mobile, 56px desktop)
            const isLandscape = ar === "16:9" || ar === "4:3"
            const isSquare = ar === "1:1"
            const isPortrait = ar === "9:16" || ar === "3:4"
            const isSelected = selectedId === char.id
            
            // Width classes based on aspect ratio
            const widthClass = isLandscape 
              ? "w-[89px] md:w-[100px]" 
              : isSquare 
              ? "w-[50px] md:w-[56px]" 
              : "w-[38px] md:w-[42px]"
            
            return (
              <div key={char.id} className="group relative">
                <button
                  onClick={() => {
                    if (!isSelected) {
                      onSelect(char.id)
                    }
                  }}
                  disabled={disabled}
                  data-selected={isSelected}
                  className={`relative h-[50px] overflow-hidden rounded-lg transition-all ring-1 ring-neutral-800 hover:ring-neutral-600 data-[selected=true]:ring-2 data-[selected=true]:ring-white disabled:cursor-not-allowed disabled:opacity-50 md:h-[56px] ${widthClass}`}
                >
                  <Image
                    src={char.src || "/placeholder.svg"}
                    alt={char.name}
                    fill
                    className={`object-cover ${isPortrait ? "object-top" : "object-center"}`}
                    sizes="(max-width: 768px) 133px, 160px"
                    quality={60}
                    loading="lazy"
                    placeholder="blur"
                    blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUH/8QAIhAAAgEDAwUBAAAAAAAAAAAAAQIDAAQRBRIhBhMiMUFR/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAZEQACAwEAAAAAAAAAAAAAAAABAgADESH/2gAMAwEAAhEDEEA/AKek6hY2+mWkM8qJMkKrIpbBDAYIOKVd"
                  />
                </button>
                
                {/* Delete button - subtle, appears on hover */}
                {canDelete && !disabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isCustom && onDeleteCustom) {
                        onDeleteCustom(char.id)
                      } else if (isDefault && onHideDefault) {
                        onHideDefault(char.id)
                      }
                    }}
                    className="absolute -right-1 -top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800/90 text-neutral-500 opacity-0 ring-1 ring-neutral-700 transition-all hover:bg-neutral-700 hover:text-white group-hover:opacity-100"
                    title={isCustom ? "Delete character" : "Hide character"}
                  >
                    <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Expand button - only shows when selected */}
                {isSelected && onExpand && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onExpand(char.src, char.id, isCustom)
                    }}
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/50"
                    title="View full image"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    </div>
                  </button>
                )}
              </div>
            )
          })}
          
{/* Upload card */}
          <div className="relative">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="h-[50px] w-[70px] rounded-lg border border-dashed border-neutral-700 transition-colors hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50 md:h-[56px] md:w-[80px]"
            >
              <div className="flex h-full flex-col items-center justify-center gap-1 text-neutral-500">
                {isUploading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="font-mono text-[9px] lowercase">uploading...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="font-mono text-[9px] lowercase">upload</span>
                  </>
                )}
              </div>
            </button>
            {/* Info icon with tooltip */}
            <div 
              className="absolute -right-1 -top-1"
              onMouseEnter={() => setShowUploadTooltip(true)}
              onMouseLeave={() => setShowUploadTooltip(false)}
            >
              <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-neutral-800 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300">
                <span className="font-mono text-[9px]">?</span>
              </div>
              {showUploadTooltip && (
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg bg-neutral-900 p-3 shadow-lg ring-1 ring-neutral-800">
                  <p className="font-mono text-[10px] leading-relaxed text-neutral-400">
                    <span className="text-neutral-300">image requirements:</span><br />
                    - clear frontal face<br />
                    - upper body visible<br />
                    - no sunglasses/masks<br />
                    - good lighting<br />
                    - min 340x340px
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* AI Generate card */}
          <div className="relative">
            <button
              onClick={() => setShowAiPrompt(!showAiPrompt)}
              disabled={disabled || isGenerating}
              className={cn(
                "h-[50px] w-[70px] rounded-lg border border-dashed transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:h-[56px] md:w-[80px]",
                showAiPrompt ? "border-white" : "border-neutral-700 hover:border-neutral-500"
              )}
            >
              <div className="flex h-full flex-col items-center justify-center gap-1 text-neutral-500">
                {isGenerating ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="font-mono text-[9px] lowercase">creating...</span>
                  </>
                ) : (
                  <span className="font-mono text-[9px] lowercase">ai create</span>
                )}
              </div>
            </button>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          </div>
        </div>
        
        {/* AI Prompt Bar - shows inline below the grid */}
        {showAiPrompt && (
          <div className="mt-3 rounded-lg bg-neutral-900 p-3">
            {isGenerating ? (
              <div className="space-y-2">
                <p className="font-mono text-[11px] text-neutral-400">
                  Generating with <span className="text-white">Nano Banana Pro</span>...
                </p>
                <div className="h-px w-full overflow-hidden bg-neutral-800">
                  <div 
                    className="h-full bg-white transition-all duration-100 ease-linear"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  id="ai-prompt-input"
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleGenerate()
                    }
                  }}
                  placeholder="describe a character..."
                  disabled={disabled}
                  autoFocus
                  className="h-8 flex-1 rounded-lg border-0 bg-neutral-800 px-3 font-mono text-[12px] text-white placeholder-neutral-500 outline-none transition-colors focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
                />
                <button
                  onClick={handleGenerate}
                  disabled={disabled || !prompt.trim()}
                  className="flex h-8 items-center justify-center rounded-lg bg-white px-3 font-mono text-[11px] text-black transition-opacity hover:opacity-80 disabled:opacity-30"
                >
                  go
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Upload error message */}
        {uploadError && (
          <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
            {uploadError}
            <button 
              onClick={() => setUploadError(null)} 
              className="ml-2 text-red-300 hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        )}
        
        {/* Submit to gallery prompt - after ai create, before my videos */}
        {showSubmitPrompt && (
          <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
            {submitDone ? (
              <p className="font-mono text-[11px] text-green-500">
                done! thanks for sharing
              </p>
            ) : !showNameInput ? (
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] text-neutral-500">
                  share with others?
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowNameInput(true)}
                    className="rounded bg-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                  >
                    yes
                  </button>
                  <button
                    onClick={dismissSubmitPrompt}
                    className="rounded px-2 py-1 font-mono text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
                  >
                    no
                  </button>
                </div>
              </div>
            ) : !showCategorySelect ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[10px] text-neutral-500">
                  character name:
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={characterName}
                    onChange={(e) => setCharacterName(e.target.value)}
                    placeholder="e.g. SpongeBob"
                    className="flex-1 rounded bg-neutral-800 px-2 py-1 font-mono text-[10px] text-white placeholder-neutral-600 outline-none ring-1 ring-neutral-700 focus:ring-neutral-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && characterName.trim()) {
                        setShowCategorySelect(true)
                      }
                    }}
                  />
                  <button
                    onClick={() => setShowCategorySelect(true)}
                    disabled={!characterName.trim()}
                    className="rounded bg-neutral-700 px-2 py-1 font-mono text-[10px] text-white transition-colors hover:bg-neutral-600 disabled:opacity-50 disabled:hover:bg-neutral-700"
                  >
                    next
                  </button>
                  <button
                    onClick={dismissSubmitPrompt}
                    className="rounded px-2 py-1 font-mono text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[10px] text-neutral-500">
                  category for &quot;{characterName}&quot;:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(["memes", "cartoons", "celebs"] as CharacterCategory[]).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleSubmitToGallery(cat)}
                      disabled={isSubmitting}
                      className="rounded bg-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-50"
                    >
                      {submittingCategory === cat ? "..." : cat}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowCategorySelect(false)}
                    disabled={isSubmitting}
                    className="rounded px-2 py-1 font-mono text-[10px] text-neutral-600 transition-colors hover:text-neutral-400 disabled:opacity-50"
                  >
                    back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Children slot for My Videos panel */}
        {children}
      </div>
      
      {/* Generate Video CTA - Always visible at bottom */}
      {onGenerate && (
        <div className="shrink-0 pt-2 md:pt-4">
          <div className="flex flex-col gap-1.5 md:gap-4">
            {generateError && (
              <p className="font-mono text-[10px] text-amber-400 md:text-[11px]">
                {generateError}
              </p>
            )}
            <button
              onClick={() => {
                if (canGenerate) {
                  setGenerateError(null)
                  onGenerate()
                } else if (!hasVideo && !hasCharacter) {
                  setGenerateError("record a video and select a character first")
                } else if (!hasVideo) {
                  setGenerateError("record a video first")
                } else if (!hasCharacter) {
                  setGenerateError("select a character first")
                }
              }}
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-lg font-mono text-[12px] font-medium transition-all active:scale-[0.98] md:h-10 md:text-[13px]",
                canGenerate 
                  ? "bg-white text-black hover:bg-neutral-200" 
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              )}
            >
              Generate video
            </button>
            <div className="hidden items-center justify-center gap-3 font-mono text-[10px] text-neutral-500 md:flex">
              <a 
                href="https://vercel.com/templates/next.js/ai-face-swap"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white"
              >
                Make this app your own
              </a>
              <span className="text-neutral-700">·</span>
              <button
                onClick={() => setShowHowItWorks(true)}
                className="cursor-pointer transition-colors hover:text-white"
              >
                How it works
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How it works modal */}
      {showHowItWorks && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setShowHowItWorks(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowHowItWorks(false)}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <div 
            className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowHowItWorks(false)}
              className="absolute right-3 top-3 text-neutral-500 transition-colors hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <h2 className="mb-6 font-mono text-[13px] font-medium text-white">how it works</h2>
            
            <div className="space-y-6 font-mono text-[11px] text-neutral-400">
              <div>
                <p className="mb-2 text-neutral-500">// ai model</p>
                <a 
                  href="https://fal.ai/models/fal-ai/kling-video/v2.6/standard/motion-control"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-300 hover:text-white"
                >
                  fal.ai/kling-video/v2.6 motion-control
                </a>
                <p className="mt-1">
                  analyzes facial landmarks, expressions, and head pose frame-by-frame from your recorded video. transfers this motion data onto the target character image while preserving their appearance.
                </p>
              </div>
              
              <div>
                <p className="mb-2 text-neutral-500">// client processing</p>
                <p className="text-neutral-300">ffmpeg.wasm in web worker</p>
                <p className="mt-1">
                  runs video encoding entirely in your browser using webassembly. handles safari mp4 compatibility (moov atom positioning), and composites the final picture-in-picture overlay with rounded corners and watermark on download.
                </p>
              </div>
              
              <div>
                <p className="mb-2 text-neutral-500">// infrastructure</p>
                <div className="mt-2 space-y-2">
                  <p>
                    <a href="https://vercel.com/docs/workflow" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">workflow</a>
                    <span className="text-neutral-500"> — </span>
                    durable function execution that survives timeouts. orchestrates the generation pipeline: receives request → calls fal api → waits for webhook → updates database.
                  </p>
                  <p>
                    <a href="https://vercel.com/docs/storage/vercel-blob" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">blob</a>
                    <span className="text-neutral-500"> — </span>
                    stores uploaded videos, character images, and generated results. serves assets via edge cdn.
                  </p>
                  <p>
                    <a href="https://neon.tech" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">neon</a>
                    <span className="text-neutral-500"> — </span>
                    serverless postgres. tracks generation state (pending → processing → completed/failed) with user associations.
                  </p>
                  <p>
                    <a href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">ai gateway</a>
                    <span className="text-neutral-500"> — </span>
                    unified routing layer for ai model requests. handles authentication, rate limiting, and provider abstraction.
                  </p>
                </div>
              </div>
              
              <div>
                <p className="mb-2 text-neutral-500">// stack</p>
                <p>
                  <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">next.js 16</a>
                  <span className="text-neutral-500"> + </span>
                  <a href="https://v0.app" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">v0</a>
                  <span className="text-neutral-500"> + </span>
                  <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white">vercel</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
