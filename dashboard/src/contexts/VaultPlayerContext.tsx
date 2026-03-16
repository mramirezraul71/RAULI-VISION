/**
 * VaultPlayerContext — reproductor global persistente de música.
 *
 * • La instancia <audio> vive fuera del árbol de React y sobrevive cambios de tab.
 * • Solo gestiona música (category === 'musica'); el video se reproduce en la página.
 * • Shuffle automático: al terminar una pista selecciona la siguiente aleatoriamente.
 */
import { createContext, useContext, useRef, useState, useCallback, useEffect, ReactNode } from 'react'
import { VaultItem, vaultStreamUrl } from '../api/vaultApi'

// ─── Tipos públicos ────────────────────────────────────────────────────────────
export interface VaultPlayerContextType {
  currentItem: VaultItem | null
  isPlaying: boolean
  shuffleOn: boolean
  play: (item: VaultItem, catalogItems?: VaultItem[]) => void
  togglePlay: () => void
  /** Pausa externamente (ej. TikTok abre). Recordará si había algo sonando. */
  pauseForExternal: () => void
  /** Reanuda solo si fue pausado por pauseForExternal (no si el usuario pausó manualmente). */
  resumeAfterExternal: () => void
  stop: () => void
  next: () => void
  toggleShuffle: () => void
  updateCatalog: (items: VaultItem[]) => void
  playRandomFrom: (items: VaultItem[]) => void
}

const Ctx = createContext<VaultPlayerContextType | null>(null)

export function useVaultPlayer(): VaultPlayerContextType {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('VaultPlayerProvider missing')
  return ctx
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function pickRandom(pool: VaultItem[], exclude: Set<string>): VaultItem | null {
  if (pool.length === 0) return null
  const fresh = pool.filter(i => !exclude.has(i.id))
  const src = fresh.length > 0 ? fresh : pool
  return src[Math.floor(Math.random() * src.length)]
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function VaultPlayerProvider({ children }: { children: ReactNode }) {
  const [currentItem, setCurrentItem] = useState<VaultItem | null>(null)
  const [isPlaying, setIsPlaying]     = useState(false)
  const [shuffleOn, setShuffleOn]     = useState(true)

  // Refs sobreviven renders sin causar re-renders
  const audioRef          = useRef<HTMLAudioElement | null>(null)
  const catalogRef        = useRef<VaultItem[]>([])          // catálogo de música actual
  const historyRef        = useRef(new Set<string>())        // ids reproducidos recientemente
  const onEndedRef        = useRef<() => void>(() => {})
  const externalPauseRef  = useRef(false)                    // pausado por agente externo (TikTok, etc.)

  // ── Actualizar catálogo interno (solo pistas de música) ─────────────────────
  const updateCatalog = useCallback((items: VaultItem[]) => {
    catalogRef.current = items.filter(i => i.category === 'musica')
  }, [])

  // ── Reproducir un item concreto ─────────────────────────────────────────────
  const doPlay = useCallback((item: VaultItem) => {
    const audio = audioRef.current
    if (!audio) return
    historyRef.current.add(item.id)
    setCurrentItem(item)
    audio.src = vaultStreamUrl(item.id)
    audio.play().catch(() => { /* silencia autoplay policy */ })
  }, [])

  // ── Siguiente aleatoria ─────────────────────────────────────────────────────
  const doNext = useCallback(() => {
    const pool = catalogRef.current
    if (pool.length === 0) return
    // Reset historial si ya pasamos por todo
    if (historyRef.current.size >= pool.length) historyRef.current.clear()
    const item = pickRandom(pool, historyRef.current)
    if (item) doPlay(item)
  }, [doPlay])

  // Mantener onEndedRef actualizado cuando cambia shuffleOn
  useEffect(() => {
    onEndedRef.current = shuffleOn ? doNext : () => {}
  }, [shuffleOn, doNext])

  // ── Crear el elemento <audio> una sola vez ──────────────────────────────────
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.addEventListener('ended',  () => onEndedRef.current())
    audio.addEventListener('play',   () => setIsPlaying(true))
    audio.addEventListener('pause',  () => setIsPlaying(false))
    audioRef.current = audio
    return () => { audio.pause(); audio.src = '' }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── API pública ─────────────────────────────────────────────────────────────
  const play = useCallback((item: VaultItem, catalogItems?: VaultItem[]) => {
    if (catalogItems) updateCatalog(catalogItems)
    doPlay(item)
  }, [doPlay, updateCatalog])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.src = '' }
    setCurrentItem(null)
    setIsPlaying(false)
    historyRef.current.clear()
  }, [])

  const next = useCallback(() => doNext(), [doNext])

  const toggleShuffle = useCallback(() => setShuffleOn(v => !v), [])

  // Pausa solicitada por un agente externo (TikTok, video, etc.)
  const pauseForExternal = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused) {
      externalPauseRef.current = true
      audio.pause()
    }
  }, [])

  // Reanuda solo si fue pausado por pauseForExternal
  const resumeAfterExternal = useCallback(() => {
    if (!externalPauseRef.current) return
    externalPauseRef.current = false
    const audio = audioRef.current
    if (audio && currentItem) {
      audio.play().catch(() => {})
    }
  }, [currentItem])

  const playRandomFrom = useCallback((items: VaultItem[]) => {
    const musicItems = items.filter(i => i.category === 'musica')
    const pool = musicItems.length > 0 ? musicItems : items.filter(i => i.category === 'musica')
    if (pool.length === 0) return
    updateCatalog(items)
    const item = pickRandom(pool, historyRef.current)
    if (item) doPlay(item)
  }, [doPlay, updateCatalog])

  return (
    <Ctx.Provider value={{ currentItem, isPlaying, shuffleOn, play, togglePlay, pauseForExternal, resumeAfterExternal, stop, next, toggleShuffle, updateCatalog, playRandomFrom }}>
      {children}
    </Ctx.Provider>
  )
}
