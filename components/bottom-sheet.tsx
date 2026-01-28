"use client"

import React from "react"

import { useState, useRef, useEffect, type ReactNode } from "react"

interface BottomSheetProps {
  children: ReactNode
  isExpanded: boolean
  onExpandedChange: (expanded: boolean) => void
  peekHeight?: number
}

export function BottomSheet({ 
  children, 
  isExpanded, 
  onExpandedChange,
  peekHeight = 140 
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [currentY, setCurrentY] = useState(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    setStartY(e.touches[0].clientY)
    setCurrentY(0)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const deltaY = e.touches[0].clientY - startY
    setCurrentY(deltaY)
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    
    // If dragged more than 50px, toggle state
    if (Math.abs(currentY) > 50) {
      if (currentY < 0 && !isExpanded) {
        onExpandedChange(true)
      } else if (currentY > 0 && isExpanded) {
        onExpandedChange(false)
      }
    }
    setCurrentY(0)
  }

  // Calculate transform based on drag
  const getTransform = () => {
    if (!isDragging) return undefined
    
    if (isExpanded) {
      // When expanded, can only drag down
      return `translateY(${Math.max(0, currentY)}px)`
    } else {
      // When collapsed, can only drag up
      return `translateY(${Math.min(0, currentY)}px)`
    }
  }

  return (
    <div
      ref={sheetRef}
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl bg-neutral-950 transition-all ${
        isDragging ? "duration-0" : "duration-300 ease-out"
      }`}
      style={{
        height: isExpanded ? "70vh" : `${peekHeight}px`,
        transform: getTransform(),
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Handle */}
      <div 
        className="flex shrink-0 cursor-grab items-center justify-center py-2 active:cursor-grabbing"
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <div className="h-1 w-8 rounded-full bg-neutral-700" />
      </div>
      
      {/* Content */}
      <div className={`flex-1 overscroll-contain px-3 pb-4 ${isExpanded ? "overflow-y-auto" : "overflow-hidden"}`}>
        {children}
      </div>
    </div>
  )
}
