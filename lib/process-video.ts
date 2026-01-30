"use client"

/**
 * Re-encode video by playing it and re-recording with MediaRecorder
 * This fixes metadata issues in Safari by creating a "clean" video
 */
export async function processVideoForUpload(
  blob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log("[v0] Re-encoding video to fix metadata...")
  
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    
    video.onloadedmetadata = () => {
      console.log("[v0] Video loaded:", { 
        duration: video.duration, 
        width: video.videoWidth, 
        height: video.videoHeight 
      })
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      // Create stream from canvas
      const canvasStream = canvas.captureStream(30)
      
      // Try to get audio from original video
      try {
        const audioCtx = new AudioContext()
        const source = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        source.connect(dest)
        source.connect(audioCtx.destination)
        dest.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track))
      } catch (e) {
        console.log("[v0] Could not capture audio:", e)
      }
      
      const chunks: Blob[] = []
      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: "video/mp4",
        videoBitsPerSecond: 5000000,
      })
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      
      mediaRecorder.onstop = () => {
        console.log("[v0] Re-encoding complete, chunks:", chunks.length)
        const newBlob = new Blob(chunks, { type: "video/mp4" })
        resolve(newBlob)
      }
      
      mediaRecorder.onerror = (e) => {
        console.error("[v0] MediaRecorder error:", e)
        reject(e)
      }
      
      // Draw video frames to canvas
      let frameCount = 0
      const drawFrame = () => {
        if (video.paused || video.ended) return
        ctx.drawImage(video, 0, 0)
        frameCount++
        if (onProgress && video.duration > 0) {
          onProgress(Math.round((video.currentTime / video.duration) * 100))
        }
        requestAnimationFrame(drawFrame)
      }
      
      video.onplay = () => {
        console.log("[v0] Starting re-encode playback")
        mediaRecorder.start()
        drawFrame()
      }
      
      video.onended = () => {
        console.log("[v0] Video ended, frames drawn:", frameCount)
        mediaRecorder.stop()
      }
      
      // Start playback at 2x speed to make it faster
      video.playbackRate = 2
      video.play().catch(reject)
    }
    
    video.onerror = () => {
      reject(new Error("Failed to load video for re-encoding"))
    }
    
    video.src = URL.createObjectURL(blob)
  })
}

/**
 * Check if browser is Safari (needs video processing)
 */
export function needsVideoProcessing(): boolean {
  if (typeof navigator === "undefined") return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}
