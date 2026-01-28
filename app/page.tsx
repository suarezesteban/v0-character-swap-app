"use client"

import { useState, useCallback, useEffect } from "react"
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
import { STORAGE_KEYS } from "@/lib/constants"

export default function Home() {
  const { user, login, logout } = useAuth()
  const isMobile = useIsMobile()
  
  // State
  const [mounted, setMounted] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [sendViaEmail, setSendViaEmail] = useState(true)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [selectedGeneratedVideo, setSelectedGeneratedVideo] = useState<string | null>(null)
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false)
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false)
  const [emailSent] = useState(false)
  const [currentAspectRatio, setCurrentAspectRatio] = useState<"9:16" | "16:9" | "fill">("fill")

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
    showPreview,
    setShowPreview,
    handleVideoRecorded,
    clearRecording,
    restoreFromSession,
    saveToSession,
  } = useVideoRecording()

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
        setTimeout(() => {
          processVideo(recordedVideo, character, sendViaEmail, uploadedVideoUrl)
        }, 100)
      }
    }
  }, [pendingAutoSubmit, user, recordedVideo, selectedCharacter, allCharacters, processVideo, sendViaEmail, uploadedVideoUrl])

  // Auto-expand bottom sheet when video is recorded
  useEffect(() => {
    if (isMobile && recordedVideo && !resultUrl) {
      setBottomSheetExpanded(true)
    }
  }, [isMobile, recordedVideo, resultUrl])

  // Handlers
  const handleProcess = useCallback(() => {
    if (!recordedVideo || !selectedCharacter) return
    const character = allCharacters.find(c => c.id === selectedCharacter)
    if (character) {
      processVideo(recordedVideo, character, sendViaEmail, uploadedVideoUrl)
    }
  }, [recordedVideo, selectedCharacter, allCharacters, processVideo, sendViaEmail, uploadedVideoUrl])

  const handleReset = useCallback(() => {
    clearRecording()
    setResultUrl(null)
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
        <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2">
            {user.avatar ? (
              <Image src={user.avatar || "/placeholder.svg"} alt={user.name || ""} width={20} height={20} className="h-5 w-5 rounded-full" />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800">
                <span className="font-mono text-[10px] text-white">
                  {user.name?.charAt(0).toLowerCase()}
                </span>
              </div>
            )}
            <span className="font-mono text-[11px] text-neutral-500">{user.name?.toLowerCase()}</span>
          </div>
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
        className="mb-4 flex items-center gap-2 border-b border-neutral-800 pb-4 font-mono text-[11px] text-neutral-500 transition-colors hover:text-white"
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
      <div className={`flex flex-1 items-center justify-center ${isMobile ? "p-0" : (resultUrl || recordedVideoUrl) ? (recordedAspectRatio === "fill" ? "p-0" : "p-2") : (currentAspectRatio === "fill" ? "p-0" : "p-2")}`}>
        {resultUrl ? (
          <div className={`relative flex h-full w-full ${recordedAspectRatio === "fill" ? "" : "items-center justify-center"}`}>
            <div className={`relative overflow-hidden bg-neutral-900 ${
              recordedAspectRatio === "9:16"
                ? "aspect-[9/16] h-full max-h-[85vh] w-auto rounded-2xl"
                : recordedAspectRatio === "16:9"
                  ? "aspect-video w-full max-w-4xl rounded-2xl"
                  : "h-full w-full"
            }`}>
              <video 
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
                }}
              />
              {/* PiP overlay - show original video in bottom right */}
              {recordedVideoUrl && (
                <div className={`absolute bottom-20 right-4 overflow-hidden rounded-lg border-2 border-white/20 shadow-lg ${
                  recordedAspectRatio === "9:16" 
                    ? "aspect-[9/16] h-32 md:h-40" 
                    : recordedAspectRatio === "16:9"
                      ? "aspect-video w-32 md:w-48"
                      : "aspect-video w-32 md:w-48"
                }`}>
                  <video
                    src={recordedVideoUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              {/* Action buttons overlayed on video */}
              <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3">
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(resultUrl)
                      const blob = await response.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = "generated-video.mp4"
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    } catch (error) {
                      console.error("Download failed:", error)
                    }
                  }}
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-lg transition-all hover:bg-neutral-100 active:scale-95"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
                <button
                  onClick={handleReset}
                  className="rounded-full bg-black/50 px-5 py-2.5 font-sans text-[13px] font-medium text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/60 active:scale-95"
                >
                  New Video
                </button>
              </div>
            </div>
          </div>
        ) : recordedVideoUrl ? (
          <div 
            className={`relative flex h-full w-full ${recordedAspectRatio === "fill" ? "" : "items-center justify-center"}`}
            onClick={(e) => {
              // If clicked outside the video container, go back to recording
              if (e.target === e.currentTarget) {
                setShowPreview(false)
                clearRecording()
              }
            }}
          >
            <div className={`relative overflow-hidden bg-neutral-900 ${
              recordedAspectRatio === "9:16"
                ? "aspect-[9/16] h-full max-h-[95vh] w-auto rounded-2xl"
                : recordedAspectRatio === "16:9"
                  ? "aspect-video w-full max-w-4xl rounded-2xl"
                  : "h-full w-full"
            }`}>
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
              <button
                onClick={() => {
                  setShowPreview(false)
                  clearRecording()
                }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 font-sans text-[13px] font-medium text-black shadow-lg transition-all hover:bg-neutral-100 active:scale-95"
              >
                Re-record
              </button>
            </div>
          </div>
        ) : (
          <CameraPreview
            onVideoRecorded={handleVideoRecorded}
            isProcessing={false}
            onAspectRatioChange={setCurrentAspectRatio}
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
                canGenerate={!!recordedVideo && !!selectedCharacter && !resultUrl}
                hasVideo={!!recordedVideo}
                hasCharacter={!!selectedCharacter}
                onGenerate={handleProcess}
                sendViaEmail={sendViaEmail}
                onSendViaEmailChange={setSendViaEmail}
              >
                <GenerationsPanel
                onSelectVideo={(url) => {
                  setSelectedGeneratedVideo(url)
                  setResultUrl(url)
                }}
                className="mt-4 border-t border-neutral-800 pt-4"
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
                    className={`relative h-12 w-9 shrink-0 overflow-hidden rounded ${
                      selectedCharacter === char.id ? "ring-2 ring-white" : "ring-1 ring-neutral-800"
                    }`}
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
            </div>
          )}

          {bottomSheetExpanded && (
            <>
              {renderAuthSection("mobile")}
              <CharacterGrid
                selectedId={selectedCharacter}
                onSelect={setSelectedCharacter}
                customCharacters={customCharacters}
                onAddCustom={addCustomCharacter}
                onDeleteCustom={deleteCustomCharacter}
                hiddenDefaultIds={hiddenDefaultIds}
                onHideDefault={hideDefaultCharacter}
                canGenerate={!!recordedVideo && !!selectedCharacter && !resultUrl}
                hasVideo={!!recordedVideo}
                hasCharacter={!!selectedCharacter}
                onGenerate={handleProcess}
                sendViaEmail={sendViaEmail}
                onSendViaEmailChange={setSendViaEmail}
              >
                <GenerationsPanel
                  onSelectVideo={(url) => {
                    setSelectedGeneratedVideo(url)
                    setResultUrl(url)
                    setBottomSheetExpanded(false)
                  }}
                  className="mt-4 border-t border-neutral-800 pt-4"
                />
              </CharacterGrid>
            </>
          )}
        </BottomSheet>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-neutral-900 p-6">
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

      {/* Toast */}
      {emailSent && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 shadow-lg">
          <p className="font-sans text-[13px] text-white">Email sent successfully</p>
        </div>
      )}
      
      {/* Error Toast */}
      {errorToast && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-red-900 px-4 py-2 shadow-lg">
          <p className="font-sans text-[13px] text-white">{errorToast}</p>
        </div>
      )}
    </main>
  )
}
