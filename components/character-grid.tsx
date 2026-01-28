"use client"

import React, { useRef, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { upload } from "@vercel/blob/client"
import type { Character } from "@/lib/types"
import { defaultCharacters } from "@/lib/constants"

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
  children?: React.ReactNode
  // Generate video CTA props
  canGenerate?: boolean
  hasVideo?: boolean
  hasCharacter?: boolean
  onGenerate?: () => void
  sendViaEmail?: boolean
  onSendViaEmailChange?: (value: boolean) => void
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
  children,
  canGenerate = false,
  hasVideo = false,
  hasCharacter = false,
  onGenerate,
  sendViaEmail = true,
  onSendViaEmailChange,
}: CharacterGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  
  const visibleDefaultCharacters = defaultCharacters.filter(c => !hiddenDefaultIds.includes(c.id))
  const allCharacters = [...visibleDefaultCharacters, ...customCharacters]

  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showUploadTooltip, setShowUploadTooltip] = useState(false)

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

  return (
    <div 
      className={cn(
        "relative flex h-full flex-col",
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
      
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="mb-2 font-mono text-[10px] lowercase text-neutral-500 md:mb-3 md:text-[11px]">
          select character
        </p>
        
        <div className="grid grid-cols-5 gap-2 md:grid-cols-4 md:gap-3">
          {allCharacters.map((char) => {
            const isCustom = customCharacters.some(c => c.id === char.id)
            const isDefault = visibleDefaultCharacters.some(c => c.id === char.id)
            const canDelete = (isCustom && onDeleteCustom) || (isDefault && onHideDefault)
            
            return (
              <div key={char.id} className="group relative">
                <button
                  onClick={() => onSelect(char.id)}
                  disabled={disabled}
                  data-selected={selectedId === char.id}
                  className="relative aspect-[3/4] w-full overflow-hidden rounded-lg transition-all ring-1 ring-neutral-800 hover:ring-neutral-600 data-[selected=true]:ring-2 data-[selected=true]:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Image
                    src={char.src || "/placeholder.svg"}
                    alt={char.name}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </button>
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
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                    title={isCustom ? "Delete character" : "Hide character"}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
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
              className="aspect-[3/4] w-full rounded-lg border border-dashed border-neutral-700 transition-colors hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                "aspect-[3/4] w-full rounded-lg border border-dashed transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                    <span className="font-mono text-[9px] lowercase">ai create</span>
                  </>
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
                  className="h-8 flex-1 rounded-md border-0 bg-neutral-800 px-3 font-mono text-[12px] text-white placeholder-neutral-500 outline-none transition-colors focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
                />
                <button
                  onClick={handleGenerate}
                  disabled={disabled || !prompt.trim()}
                  className="flex h-8 items-center justify-center rounded-md bg-white px-3 font-mono text-[11px] text-black transition-opacity hover:opacity-80 disabled:opacity-30"
                >
                  go
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Upload error message */}
        {uploadError && (
          <div className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
            {uploadError}
            <button 
              onClick={() => setUploadError(null)} 
              className="ml-2 text-red-300 hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        )}
        
        {/* Children slot for My Videos panel */}
        {children}
      </div>
      
      {/* Generate Video CTA - Always visible at bottom */}
      {onGenerate && (
        <div className="shrink-0 border-t border-neutral-800 pt-3 md:pt-4">
          <div className="flex flex-col gap-2 md:gap-4">
            {onSendViaEmailChange && (
              <label className={cn(
                "flex cursor-pointer items-center gap-2",
                !canGenerate && "opacity-50 pointer-events-none"
              )}>
                <input
                  type="checkbox"
                  checked={sendViaEmail}
                  onChange={(e) => onSendViaEmailChange(e.target.checked)}
                  disabled={!canGenerate}
                  className="h-3 w-3 rounded-sm border-neutral-700 bg-transparent accent-white"
                />
                <span className="font-mono text-[10px] text-neutral-500 md:text-[11px]">
                  send video via email when ready
                </span>
              </label>
            )}
            <p className={cn(
              "hidden font-mono text-[10px] text-neutral-600 md:block",
              !canGenerate && "opacity-50"
            )}>
              generation takes 3-4 minutes. we{"'"}ll email you when complete.
            </p>
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
          </div>
        </div>
      )}
    </div>
  )
}
