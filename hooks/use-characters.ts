"use client"

import { useState, useEffect, useCallback } from "react"
import type { Character, User, ReferenceImage } from "@/lib/types"
import { STORAGE_KEYS, CUSTOM_CHARACTER_ID_OFFSET, DEFAULT_CHARACTERS } from "@/lib/constants"

interface UseCharactersOptions {
  user: User | null
}

interface UseCharactersReturn {
  customCharacters: Character[]
  hiddenDefaultIds: number[]
  selectedCharacter: number | null
  setSelectedCharacter: (id: number | null) => void
  addCustomCharacter: (character: Character) => Promise<void>
  deleteCustomCharacter: (id: number) => Promise<void>
  hideDefaultCharacter: (id: number) => void
  visibleDefaultCharacters: Character[]
  allCharacters: Character[]
}

export function useCharacters({ user }: UseCharactersOptions): UseCharactersReturn {
  const [customCharacters, setCustomCharacters] = useState<Character[]>([])
  const [hiddenDefaultIds, setHiddenDefaultIds] = useState<number[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null)

  // Load hidden default characters from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.HIDDEN_CHARACTERS)
    if (stored) {
      try {
        setHiddenDefaultIds(JSON.parse(stored))
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Load user's reference images from database
  useEffect(() => {
    if (user) {
      fetch("/api/reference-images", { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (data.images) {
            const loadedCharacters: Character[] = data.images.map((img: ReferenceImage) => ({
              id: CUSTOM_CHARACTER_ID_OFFSET + img.id,
              name: img.name,
              src: img.image_url,
              dbId: img.id,
            }))
            setCustomCharacters(loadedCharacters)
          }
        })
        .catch(console.error)
    } else {
      setCustomCharacters([])
    }
  }, [user])

  const addCustomCharacter = useCallback(async (character: Character) => {
    if (user) {
      try {
        const res = await fetch("/api/reference-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: character.name,
            imageUrl: character.src,
          }),
        })
        const data = await res.json()
        if (data.id) {
          setCustomCharacters(prev => [...prev, {
            ...character,
            id: CUSTOM_CHARACTER_ID_OFFSET + data.id,
            dbId: data.id,
          }])
          return
        }
      } catch (error) {
        console.error("Failed to save reference image:", error)
      }
    }
    // Fallback: just add locally
    setCustomCharacters(prev => [...prev, character])
  }, [user])

  const deleteCustomCharacter = useCallback(async (id: number) => {
    const character = customCharacters.find(c => c.id === id)
    
    if (character?.dbId) {
      try {
        await fetch(`/api/reference-images/${character.dbId}`, {
          method: "DELETE",
          credentials: "include",
        })
      } catch (error) {
        console.error("Failed to delete reference image:", error)
      }
    }
    
    setCustomCharacters(prev => prev.filter(c => c.id !== id))
    if (selectedCharacter === id) {
      setSelectedCharacter(null)
    }
  }, [selectedCharacter, customCharacters])

  const hideDefaultCharacter = useCallback((id: number) => {
    setHiddenDefaultIds(prev => {
      const newHidden = [...prev, id]
      localStorage.setItem(STORAGE_KEYS.HIDDEN_CHARACTERS, JSON.stringify(newHidden))
      return newHidden
    })
    if (selectedCharacter === id) {
      setSelectedCharacter(null)
    }
  }, [selectedCharacter])

  const visibleDefaultCharacters = DEFAULT_CHARACTERS.filter(
    c => !hiddenDefaultIds.includes(c.id)
  )

  const allCharacters = [...visibleDefaultCharacters, ...customCharacters]

  return {
    customCharacters,
    hiddenDefaultIds,
    selectedCharacter,
    setSelectedCharacter,
    addCustomCharacter,
    deleteCustomCharacter,
    hideDefaultCharacter,
    visibleDefaultCharacters,
    allCharacters,
  }
}
