"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { CameraPreview } from "@/components/camera-preview"
import { CharacterGrid, defaultCharacters } from "@/components/character-grid"
import { useAuth } from "@/components/auth-provider"
import { BottomSheet } from "@/components/bottom-sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { GenerationsPanel } from "@/components/generations-panel"
import { useCharacters } from "@/hooks/use-characters"
import { useVideoGeneration } from "@/hooks/use-video-generation"
import { useVideoRecording } from "@/hooks/use-video-recording"
import { useVideoDownload } from "@/hooks/use-video-download"
import { STORAGE_KEYS } from "@/lib/constants"
import { cn, detectImageAspectRatio } from "@/lib/utils"

// Helper to get character aspect ratio for generated video
async function getCharacterAspectRatio(src: string): Promise<"9:16" | "16:9" | "fill"> {
  const ratio = await detectImageAspectRatio(src)
  if (ratio === "9:16" || ratio === "3:4") return "9:16"
  if (ratio === "16:9" || ratio === "4:3") return "16:9"
  return "fill"
}

export default function Home() {
  const { user, login, logout } = useAuth()
  const isMobile = useIsMobile()
  
  // State
  const [mounted, setMounted] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null)
  // Aspect ratio of the source/PiP video (from DB when viewing generation, or from recording)
  const [sourceVideoAspectRatio, setSourceVideoAspectRatio] = useState<"9:16" | "16:9" | "fill">("fill")
  const [selectedGeneratedVideo, setSelectedGeneratedVideo] = useState<string | null>(null)
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false)
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false)
  // Detected aspect ratio of the generated video (from character image)
  const [generatedVideoAspectRatio, setGeneratedVideoAspectRatio] = useState<"9:16" | "16:9" | "fill">("fill")
  const [showPip, setShowPip] = useState(true)

  // Video refs for sync
  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)

  // Custom hooks
  const {
    customCharacters,
    hiddenDefaultIds,
    selectedCharacter,
    setSelectedCharacter,
    addCustomCharacter,
    deleteCustomCharacter,
    hideDefaultCharacter,
    visibleDefaultCharacters,
    allCharacters,
  } = useCharacters({ user })

  const {
    recordedVideo,
    recordedVideoUrl,
    uploadedVideoUrl,
    recordedAspectRatio,
    isUploading,
    isProcessing: isProcessingVideo,
    processingProgress,
    showPreview,
    setShowPreview,
    handleVideoRecorded,
    clearRecording,
    restoreFromSession,
    saveToSession,
  } = useVideoRecording()

  // Video download hook
  const pipAspectRatio = sourceVideoUrl ? sourceVideoAspectRatio : recordedAspectRatio
  const { isDownloading, downloadProgress, handleDownload } = useVideoDownload({
    resultUrl,
    pipVideoUrl: sourceVideoUrl || recordedVideoUrl,
    showPip,
    pipAspectRatio,
  })

  const [errorToast, setErrorToast] = useState<string | null>(null)
  
  const {
    processVideo,
  } = useVideoGeneration({
    user,
    onLoginRequired: () => setShowLoginModal(true),
    onSuccess: () => {
      // Don't clear recording - allow user to generate with another character
      setSelectedCharacter(null)
      setResultUrl(null)
    },
    onError: (message) => {
      setErrorToast(message)
      setTimeout(() => setErrorToast(null), 5000)
    },
  })

  // Initialize and restore session state
  useEffect(() => {
    setMounted(true)
    
    const savedCharacter = sessionStorage.getItem(STORAGE_KEYS.PENDING_CHARACTER)
    if (savedCharacter) {
      setSelectedCharacter(Number(savedCharacter))
      sessionStorage.removeItem(STORAGE_KEYS.PENDING_CHARACTER)
    }
    
    restoreFromSession().then(({ shouldAutoSubmit }) => {
      if (shouldAutoSubmit) {
        setPendingAutoSubmit(true)
      }
    })
  }, [restoreFromSession, setSelectedCharacter])

  // Auto-submit generation after login
  useEffect(() => {
    if (pendingAutoSubmit && user && recordedVideo && selectedCharacter) {
      setPendingAutoSubmit(false)
      const character = allCharacters.find(c => c.id === selectedCharacter)
      if (character) {
        // Use character image aspect ratio, not recorded video aspect ratio
        getCharacterAspectRatio(character.src).then(characterAspectRatio => {
          setTimeout(() => {
            processVideo(recordedVideo, character, false, uploadedVideoUrl, characterAspectRatio)
          }, 100)
        })
      }
    }
  }, [pendingAutoSubmit, user, recordedVideo, selectedCharacter, allCharacters, processVideo, uploadedVideoUrl])

  // Auto-expand bottom sheet when video is recorded
  useEffect(() => {
    if (isMobile && recordedVideo && !resultUrl) {
      setBottomSheetExpanded(true)
    }
  }, [isMobile, recordedVideo, resultUrl])

  // Handlers
  const handleProcess = useCallback(async () => {
    if (!recordedVideo || !selectedCharacter) return
    const character = allCharacters.find(c => c.id === selectedCharacter)
    if (character) {
      // Use character image aspect ratio for generated video, but also pass recorded video aspect ratio
      const characterAspectRatio = await getCharacterAspectRatio(character.src)
      processVideo(recordedVideo, character, false, uploadedVideoUrl, characterAspectRatio, recordedAspectRatio)
    }
  }, [recordedVideo, selectedCharacter, allCharacters, processVideo, uploadedVideoUrl, recordedAspectRatio])

  const handleReset = useCallback(() => {
    clearRecording()
    setResultUrl(null)
    setSourceVideoUrl(null)
    setSelectedCharacter(null)
    setSelectedGeneratedVideo(null)
  }, [clearRecording, setSelectedCharacter])

  // Handle Escape key to close video and go back to camera
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (resultUrl || recordedVideoUrl) {
          e.preventDefault()
          handleReset()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [resultUrl, recordedVideoUrl, handleReset])

  const handleLoginAndContinue = useCallback(async () => {
    if (recordedVideo) {
      await saveToSession(recordedVideo, selectedCharacter)
    }
    setShowLoginModal(false)
    login()
  }, [recordedVideo, selectedCharacter, saveToSession, login])

  // Render helpers
  const renderAuthSection = (size: "desktop" | "mobile") => {
    if (!mounted) return null
    
    const avatarSize = size === "desktop" ? "h-5 w-5" : "h-6 w-6"
    const textSize = size === "desktop" ? "text-[12px]" : "text-[13px]"
    
    if (user) {
      return (
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[11px] text-neutral-500">{user.name?.toLowerCase()}</span>
          <button
            onClick={logout}
            className="font-mono text-[11px] text-neutral-600 transition-colors hover:text-white"
          >
            sign out
          </button>
        </div>
      )
    }
    
    return (
      <button
        onClick={login}
        className="mb-4 flex items-center gap-2 font-mono text-[11px] text-neutral-500 transition-colors hover:text-white"
      >
        <svg className="h-3 w-3" viewBox="0 0 76 65" fill="currentColor">
          <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
        </svg>
        sign in with vercel
      </button>
    )
  }

  

  return (
    <main className="relative flex h-[100dvh] flex-row overflow-hidden bg-black">
      {/* Camera/Video Section */}
      <div className={cn(
        "flex flex-1 items-center justify-center",
        isMobile ? "p-0" : (resultUrl || recordedVideoUrl) 
          ? (generatedVideoAspectRatio === "fill" ? "p-0" : "p-1") 
          : "p-0"
      )}>
        {resultUrl ? (
          <div className="relative flex h-full w-full flex-col items-center justify-center md:flex-row">
            <div className={cn(
              "relative overflow-hidden bg-neutral-900",
              generatedVideoAspectRatio === "9:16" && "aspect-[9/16] h-full max-h-[85vh] w-auto rounded-lg",
              generatedVideoAspectRatio === "16:9" && "aspect-video w-full max-w-[95%] rounded-lg md:max-w-[90%]",
              generatedVideoAspectRatio === "fill" && "h-full w-full"
            )}>
              <video 
                ref={mainVideoRef}
                src={resultUrl} 
                controls 
                autoPlay 
                muted
                loop 
                playsInline
                className="h-full w-full object-cover"
                onLoadedData={(e) => {
                  const video = e.currentTarget
                  video.muted = false
                  // Detect aspect ratio of generated video
                  const ratio = video.videoWidth / video.videoHeight
                  if (ratio < 0.7) {
                    setGeneratedVideoAspectRatio("9:16")
                  } else if (ratio > 1.4) {
                    setGeneratedVideoAspectRatio("16:9")
                  } else {
                    setGeneratedVideoAspectRatio("fill")
                  }
                }}
                onPlay={() => {
                  pipVideoRef.current?.play()
                }}
                onPause={() => {
                  pipVideoRef.current?.pause()
                }}
                onSeeked={() => {
                  if (pipVideoRef.current && mainVideoRef.current) {
                    pipVideoRef.current.currentTime = mainVideoRef.current.currentTime
                  }
                }}
                onTimeUpdate={() => {
                  // Sync PiP video time with main video (handles loop restart)
                  if (pipVideoRef.current && mainVideoRef.current) {
                    const timeDiff = Math.abs(pipVideoRef.current.currentTime - mainVideoRef.current.currentTime)
                    if (timeDiff > 0.5) {
                      pipVideoRef.current.currentTime = mainVideoRef.current.currentTime
                    }
                  }
                }}
              />
              {/* PiP video overlay - positioned at bottom right */}
              {(sourceVideoUrl || recordedVideoUrl) && showPip && (
                <div className={cn(
                  "absolute bottom-4 right-4 overflow-hidden rounded-lg border-2 border-white/20 shadow-lg md:bottom-20",
                  pipAspectRatio === "9:16" && "aspect-[9/16] h-28 md:h-40",
                  pipAspectRatio !== "9:16" && "aspect-video w-28 md:w-48"
                )}>
                  <video
                    ref={pipVideoRef}
                    src={sourceVideoUrl || recordedVideoUrl || ""}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              {/* Action buttons - below video on mobile, overlayed on desktop */}
              <div className="absolute bottom-16 left-1/2 hidden -translate-x-1/2 items-center gap-3 md:flex">
                <button
                  disabled={isDownloading}
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-xl transition-all hover:bg-neutral-100 active:scale-95 disabled:opacity-70"
                >
                  {isDownloading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {Math.round(downloadProgress * 100)}%
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  className="whitespace-nowrap rounded-lg bg-white/90 px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-xl backdrop-blur-md transition-all hover:bg-white active:scale-95"
                >
                  New Video
                </button>
                {/* PiP toggle button - desktop */}
                {(sourceVideoUrl || recordedVideoUrl) && (
                  <button
                    onClick={() => setShowPip(!showPip)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 font-sans text-[13px] font-medium shadow-xl backdrop-blur-md transition-all active:scale-95 ${
                      showPip 
                        ? "bg-white text-black hover:bg-neutral-100" 
                        : "bg-white/90 text-black hover:bg-white"
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <rect x="12" y="10" width="8" height="5" rx="1" />
                    </svg>
                    {showPip ? "PiP on" : "PiP off"}
                  </button>
                )}
              </div>
            </div>
            {/* Mobile action buttons - below video */}
            <div className="flex items-center justify-center gap-3 py-4 md:hidden">
              <button
                disabled={isDownloading}
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-lg transition-all hover:bg-neutral-100 active:scale-95 disabled:opacity-70"
              >
                {isDownloading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {Math.round(downloadProgress * 100)}%
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                className="whitespace-nowrap rounded-lg bg-white/90 px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-lg transition-all hover:bg-white active:scale-95"
              >
                New Video
              </button>
              {/* PiP toggle button - mobile */}
              {(sourceVideoUrl || recordedVideoUrl) && (
                <button
                  onClick={() => setShowPip(!showPip)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 font-sans text-[13px] font-medium shadow-lg transition-all active:scale-95 ${
                    showPip 
                      ? "bg-white text-black" 
                      : "bg-white/90 text-black"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <rect x="12" y="10" width="8" height="5" rx="1" />
                  </svg>
                  {showPip ? "PiP" : "PiP"}
                </button>
              )}
            </div>
          </div>
        ) : recordedVideoUrl ? (
          <div 
            className="relative flex h-full w-full"
            onClick={(e) => {
              // If clicked outside the video container, go back to recording
              if (e.target === e.currentTarget) {
                setShowPreview(false)
                clearRecording()
              }
            }}
          >
            <div className="relative h-full w-full overflow-hidden bg-neutral-900">
              <video 
                src={recordedVideoUrl} 
                controls 
                autoPlay 
                muted
                loop 
                playsInline
                className="h-full w-full object-cover" 
                onLoadedData={(e) => {
                  // Unmute after autoplay starts
                  const video = e.currentTarget
                  video.muted = false
                }}
              />
              {/* New video button - positioned above mobile bottom sheet */}
              <button
                onClick={() => {
                  setShowPreview(false)
                  clearRecording()
                }}
                className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-lg bg-white px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-lg transition-all hover:bg-neutral-100 active:scale-95 md:bottom-6"
              >
                New Video
              </button>
              {/* Processing overlay */}
              {(isProcessingVideo || isUploading) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <div className="flex w-full max-w-[280px] flex-col items-center gap-4 px-6">
                    <p className="font-sans text-[15px] font-medium tracking-wide text-white">
                      {isUploading ? "Uploading" : "Processing video"}
                    </p>
                    <div className="flex w-full flex-col items-center gap-2">
                      <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/20">
                        {isUploading ? (
                          /* Animated indeterminate progress bar for upload */
                          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-white" />
                        ) : (
                          <div
                            className="h-full rounded-full bg-white transition-all duration-300 ease-out"
                            style={{ width: `${Math.min(100, Math.max(0, processingProgress?.percent || 0))}%` }}
                          />
                        )}
                      </div>
                      {!isUploading && (
                        <p className="font-mono text-[13px] tabular-nums text-white/60">
                          {Math.min(100, Math.max(0, processingProgress?.percent || 0))}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <CameraPreview
            onVideoRecorded={handleVideoRecorded}
            isProcessing={false}
          />
        )}
      </div>

      {/* Desktop Sidebar */}
      {!isMobile && (
        <div className="flex h-full w-96 flex-col border-l border-neutral-800 bg-neutral-950 p-5">
          {renderAuthSection("desktop")}
          <div className="min-h-0 flex-1">
<CharacterGrid
                selectedId={selectedCharacter}
                onSelect={setSelectedCharacter}
                customCharacters={customCharacters}
                onAddCustom={addCustomCharacter}
                onDeleteCustom={deleteCustomCharacter}
                hiddenDefaultIds={hiddenDefaultIds}
                onHideDefault={hideDefaultCharacter}
                canGenerate={!!recordedVideo && !!selectedCharacter && !resultUrl && !isProcessingVideo && !isUploading}
                hasVideo={!!recordedVideo}
                hasCharacter={!!selectedCharacter}
                onGenerate={handleProcess}
              >
                <GenerationsPanel
                  onSelectVideo={(url, sourceUrl, aspectRatio) => {
                    setSelectedGeneratedVideo(url)
                    setResultUrl(url)
                    setSourceVideoUrl(sourceUrl)
                    setSourceVideoAspectRatio(aspectRatio)
                    setCurrentAspectRatio(aspectRatio)
                  }}
                  className="mt-4"
                />
              </CharacterGrid>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {isMobile && (
        <BottomSheet
          isExpanded={bottomSheetExpanded}
          onExpandedChange={setBottomSheetExpanded}
          peekHeight={100}
        >
          {!bottomSheetExpanded && (
            <div>
              {resultUrl ? (
                /* When viewing a video, show other videos in peek */
                <>
                  <p className="mb-1.5 font-sans text-[9px] font-medium uppercase tracking-wider text-neutral-500">
                    My Videos
                  </p>
                  <GenerationsPanel
                    onSelectVideo={(url, sourceUrl, aspectRatio) => {
                      setSelectedGeneratedVideo(url)
                      setResultUrl(url)
                      setSourceVideoUrl(sourceUrl)
                      setSourceVideoAspectRatio(aspectRatio)
                    }}
                    variant="compact"
                  />
                </>
              ) : (
                /* Default: show characters in peek */
                <>
                  <p className="mb-1.5 font-sans text-[9px] font-medium uppercase tracking-wider text-neutral-500">
                    Select Character
                  </p>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {[...visibleDefaultCharacters, ...customCharacters].slice(0, 8).map((char) => (
                      <button
                        key={char.id}
                        onClick={() => {
                          setSelectedCharacter(char.id)
                          if (recordedVideo) setBottomSheetExpanded(true)
                        }}
                        className={cn(
                          "relative h-12 w-9 shrink-0 overflow-hidden rounded",
                          selectedCharacter === char.id ? "ring-2 ring-white" : "ring-1 ring-neutral-800"
                        )}
                      >
                        <Image src={char.src || "/placeholder.svg"} alt={char.name} fill className="object-cover" sizes="36px" />
                      </button>
                    ))}
                    <button
                      onClick={() => setBottomSheetExpanded(true)}
                      className="flex h-12 w-9 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700"
                    >
                      <svg className="h-3 w-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {bottomSheetExpanded && (
            <>
              {renderAuthSection("mobile")}
              {resultUrl ? (
                /* When viewing a video, show videos first then characters */
                <>
                  <GenerationsPanel
                    onSelectVideo={(url, sourceUrl, aspectRatio) => {
                      setSelectedGeneratedVideo(url)
                      setResultUrl(url)
                      setSourceVideoUrl(sourceUrl)
                      setSourceVideoAspectRatio(aspectRatio)
                      setBottomSheetExpanded(false)
                    }}
                    className="mb-6"
                  />
                  <p className="mb-3 font-sans text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    Create New
                  </p>
                  <CharacterGrid
                    selectedId={selectedCharacter}
                    onSelect={setSelectedCharacter}
                    customCharacters={customCharacters}
                    onAddCustom={addCustomCharacter}
                    onDeleteCustom={deleteCustomCharacter}
                    hiddenDefaultIds={hiddenDefaultIds}
                    onHideDefault={hideDefaultCharacter}
                    canGenerate={!!recordedVideo && !!selectedCharacter && !resultUrl && !isProcessingVideo && !isUploading}
                    hasVideo={!!recordedVideo}
                    hasCharacter={!!selectedCharacter}
                    onGenerate={handleProcess}
                  />
                </>
              ) : (
                /* Default: show characters with videos below */
                <CharacterGrid
                  selectedId={selectedCharacter}
                  onSelect={setSelectedCharacter}
                  customCharacters={customCharacters}
                  onAddCustom={addCustomCharacter}
                  onDeleteCustom={deleteCustomCharacter}
                  hiddenDefaultIds={hiddenDefaultIds}
                  onHideDefault={hideDefaultCharacter}
                  canGenerate={!!recordedVideo && !!selectedCharacter && !resultUrl && !isProcessingVideo && !isUploading}
                  hasVideo={!!recordedVideo}
                  hasCharacter={!!selectedCharacter}
                  onGenerate={handleProcess}
                >
                  <GenerationsPanel
                    onSelectVideo={(url, sourceUrl, aspectRatio) => {
                      setSelectedGeneratedVideo(url)
                      setResultUrl(url)
                      setSourceVideoUrl(sourceUrl)
                      setSourceVideoAspectRatio(aspectRatio)
                      setBottomSheetExpanded(false)
                    }}
                    className="mt-4"
                  />
                </CharacterGrid>
              )}
            </>
          )}
        </BottomSheet>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-neutral-900 p-6">
            <h2 className="mb-2 font-sans text-lg font-semibold text-white">Sign in to generate</h2>
            <p className="mb-6 font-sans text-[13px] text-neutral-400">
              Create an account to generate your video. Your recording and character selection will be saved.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleLoginAndContinue}
                className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-sans text-[13px] font-medium text-black transition-all hover:bg-neutral-200 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" viewBox="0 0 76 65" fill="currentColor">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                Continue with Vercel
              </button>
              <button
                onClick={() => setShowLoginModal(false)}
                className="rounded-lg px-4 py-3 font-sans text-[13px] text-neutral-400 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Error Toast */}
      {errorToast && (
          <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg bg-red-900 px-4 py-2 shadow-lg">
          <p className="font-sans text-[13px] text-white">{errorToast}</p>
        </div>
      )}
    </main>
  )
}
