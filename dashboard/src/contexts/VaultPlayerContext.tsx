/**
 * VaultPlayerContext — reproductor global persistente de música.
 *
 * • La instancia <audio> vive fuera del árbol de React y sobrevive cambios de tab.
 * • Solo gestiona música (category === 'musica'); el video se reproduce en la página.
 * • Shuffle automático: al terminar una pista selecciona la siguiente aleatoriamente.
 * • v2: progress/duration/seek/prev añadidos para mini-player con barra de progreso.
 */
import { createContext, useContext, useRef, useState, useCallback, useEffect, ReactNode } from 'react'
import { VaultItem, vaultStreamUrl } from '../api/vaultApi'

// ─── Tipos públicos ────────────────────────────────────────────────────────────
export interface VaultPlayerContextType {
  currentItem: VaultItem | null
  isPlaying: boolean
  shuffleOn: boolean
  progress: number        // 0–1, actualizado cada 500 ms
  duration: number        // segundos totales de la pista actual
  play: (item: VaultItem, catalogItems?: VaultItem[]) => void
  togglePlay: () => void
  /** Pausa externamente (ej. TikTok abre). Recordará si había algo sonando. */
  pauseForExternal: () => void
  /** Reanuda solo si fue pausado por pauseForExternal (no si el usuario pausó manualmente). */
  resumeAfterExternal: () => void
  stop: () => void
  next: () => void
  /** Retrocede a la pista anterior del historial (si existe). */
  prev: () => void
  /** Salta a una posición concreta: fraction 0–1. */
  seek: (fraction: number) => void
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
  const [progress, setProgress]       = useState(0)
  const [duration, setDuration]       = useState(0)

  // Refs sobreviven renders sin causar re-renders
  const audioRef          = useRef<HTMLAudioElement | null>(null)
  const catalogRef        = useRef<VaultItem[]>([])          // catálogo de música actual
  const historyRef        = useRef(new Set<string>())        // ids reproducidos recientemente
  const historyOrderRef   = useRef<VaultItem[]>([])          // orden real de reproducción para prev()
  const onEndedRef        = useRef<() => void>(() => {})
  const externalPauseRef  = useRef(false)                    // pausado por agente externo (TikTok, etc.)
  const progressTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Actualizar catálogo interno (solo pistas de música) ─────────────────────
  const updateCatalog = useCallback((items: VaultItem[]) => {
    catalogRef.current = items.filter(i => i.category === 'musica')
  }, [])

  // ── Iniciar/parar el timer de progreso ──────────────────────────────────────
  const startProgressTimer = useCallback(() => {
    if (progressTimerRef.current) return
    progressTimerRef.current = setInterval(() => {
      const audio = audioRef.current
      if (!audio || !audio.duration || isNaN(audio.duration)) return
      setProgress(audio.currentTime / audio.duration)
      setDuration(audio.duration)
    }, 500)
  }, [])

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  // ── Reproducir un item concreto ─────────────────────────────────────────────
  const doPlay = useCallback((item: VaultItem) => {
    const audio = audioRef.current
    if (!audio) return
    historyRef.current.add(item.id)
    historyOrderRef.current.push(item)
    setCurrentItem(item)
    setProgress(0)
    setDuration(0)
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
    audio.addEventListener('ended',        () => { onEndedRef.current() })
    audio.addEventListener('play',         () => { setIsPlaying(true); startProgressTimer() })
    audio.addEventListener('pause',        () => { setIsPlaying(false); stopProgressTimer() })
    audio.addEventListener('loadedmetadata', () => {
      if (!isNaN(audio.duration)) setDuration(audio.duration)
    })
    audioRef.current = audio
    return () => {
      audio.pause()
      audio.src = ''
      stopProgressTimer()
    }
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
    setProgress(0)
    setDuration(0)
    historyRef.current.clear()
    historyOrderRef.current = []
    stopProgressTimer()
  }, [stopProgressTimer])

  const next = useCallback(() => doNext(), [doNext])

  const prev = useCallback(() => {
    const order = historyOrderRef.current
    // Necesitamos al menos 2 entradas (actual + anterior)
    if (order.length < 2) return
    // Quitar la pista actual del historial de orden
    historyOrderRef.current = order.slice(0, -1)
    const prevItem = historyOrderRef.current[historyOrderRef.current.length - 1]
    if (!prevItem) return
    // Quitar del historial de ids también para no bloquearla
    historyRef.current.delete(prevItem.id)
    // Reproducir sin volver a añadir al historial de orden (doPlay la re-añadirá)
    historyOrderRef.current = historyOrderRef.current.slice(0, -1)
    doPlay(prevItem)
  }, [doPlay])

  const seek = useCallback((fraction: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration || isNaN(audio.duration)) return
    const clamped = Math.max(0, Math.min(1, fraction))
    audio.currentTime = clamped * audio.duration
    setProgress(clamped)
  }, [])

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
    <Ctx.Provider value={{
      currentItem, isPlaying, shuffleOn, progress, duration,
      play, togglePlay, pauseForExternal, resumeAfterExternal,
      stop, next, prev, seek, toggleShuffle, updateCatalog, playRandomFrom,
    }}>
      {children}
    </Ctx.Provider>
  )
}
