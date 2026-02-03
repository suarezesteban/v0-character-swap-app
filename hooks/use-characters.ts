"use client"

import { useState, useEffect, useCallback } from "react"
import type { Character, User, ReferenceImage, CharacterCategory } from "@/lib/types"
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
  trackCharacterUsage: (characterId: number) => void
  selectedCategory: CharacterCategory | "all"
  setSelectedCategory: (category: CharacterCategory | "all") => void
  filteredCharacters: Character[]
  updateCustomCharacterCategory: (characterId: number, category: CharacterCategory) => void
}

export function useCharacters({ user }: UseCharactersOptions): UseCharactersReturn {
  const [customCharacters, setCustomCharacters] = useState<Character[]>([])
  const [hiddenDefaultIds, setHiddenDefaultIds] = useState<number[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null)
  const [usageMap, setUsageMap] = useState<Record<string, number>>({})
  const [selectedCategory, setSelectedCategory] = useState<CharacterCategory | "all">("popular")
  const [approvedCharacters, setApprovedCharacters] = useState<Character[]>([])

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

  // Fetch character usage stats
  useEffect(() => {
    fetch("/api/character-usage")
      .then(res => res.json())
      .then(data => {
        if (data.usage) {
          setUsageMap(data.usage)
        }
      })
      .catch(console.error)
  }, [])

  // Fetch approved characters (community-submitted and admin-approved)
  useEffect(() => {
    fetch("/api/approved-characters")
      .then(res => res.json())
      .then(data => {
        if (data.characters) {
          // Convert DB format to Character format with high IDs to avoid conflicts
          const approved = data.characters.map((c: { id: number; image_url: string; suggested_name: string | null; suggested_category: string | null }, i: number) => ({
            id: 5000 + c.id, // Use high IDs to avoid conflicts with defaults and customs
            src: c.image_url,
            name: c.suggested_name || `Community ${i + 1}`,
            category: c.suggested_category as CharacterCategory,
          }))
          setApprovedCharacters(approved)
        }
      })
      .catch(console.error)
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

  // Track character usage (call when generating video)
  const trackCharacterUsage = useCallback((characterId: number) => {
    fetch("/api/character-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: String(characterId) }),
    }).catch(console.error)
    
    // Update local state optimistically
    setUsageMap(prev => ({
      ...prev,
      [String(characterId)]: (prev[String(characterId)] || 0) + 1,
    }))
  }, [])

  // Update custom character category (when user shares it)
  const updateCustomCharacterCategory = useCallback((characterId: number, category: CharacterCategory) => {
    setCustomCharacters(prev =>
      prev.map(c => c.id === characterId ? { ...c, category } : c)
    )
  }, [])

  // Add usage count to characters and sort by popularity
  const charactersWithUsage = DEFAULT_CHARACTERS.map(c => ({
    ...c,
    usageCount: usageMap[String(c.id)] || 0,
  }))

  const visibleDefaultCharacters = charactersWithUsage.filter(
    c => !hiddenDefaultIds.includes(c.id)
  )

  // Get URLs of custom characters to filter out duplicates from approved
  const customCharacterUrls = new Set(customCharacters.map(c => c.src))
  
  // Filter approved characters to exclude ones that are already in custom characters (same image URL)
  const filteredApprovedCharacters = approvedCharacters.filter(
    c => !customCharacterUrls.has(c.src)
  )

  const allCharacters = [...visibleDefaultCharacters, ...filteredApprovedCharacters, ...customCharacters]

  // Filter characters by category
  const filteredCharacters = selectedCategory === "popular"
    ? [...allCharacters].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    : selectedCategory === "all"
    ? allCharacters
    : allCharacters.filter(c => c.category === selectedCategory)

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
    trackCharacterUsage,
    selectedCategory,
    setSelectedCategory,
    filteredCharacters,
    updateCustomCharacterCategory,
  }
}
