import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestData {
  ok: boolean
  text: string
  city: string
  temp_c?: string
  cached_at: string
  expires_in_seconds: number
  from_store?: boolean
}

export interface DigestHistoryEntry {
  date: string
  text: string
}

export interface DigestHistoryData {
  ok: boolean
  entries: DigestHistoryEntry[]
}

export type DigestAudioState = 'idle' | 'loading' | 'playing' | 'error'

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchDigest(userToken?: string): Promise<DigestData> {
  const url = userToken ? `/api/digest?u=${encodeURIComponent(userToken)}` : '/api/digest'
  const r = await fetch(url)
  if (!r.ok) throw new Error(`digest_error_${r.status}`)
  return r.json()
}

async function fetchDigestHistory(userToken?: string): Promise<DigestHistoryData> {
  const url = userToken
    ? `/api/digest/history?u=${encodeURIComponent(userToken)}&limit=7`
    : '/api/digest/history?limit=7'
  const r = await fetch(url)
  if (!r.ok) throw new Error(`digest_history_error_${r.status}`)
  return r.json()
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useDigest — gestiona el Resumen del Día con TTS.
 *
 * Uso:
 *   const { digest, audioState, play, stop, history } = useDigest(userToken)
 *
 * - `digest`     → datos del resumen (text, city, temp_c, from_store, …)
 * - `audioState` → 'idle' | 'loading' | 'playing' | 'error'
 * - `play()`     → solicita el resumen y lanza TTS; si ya está playing, lo detiene
 * - `stop()`     → detiene el audio
 * - `history`    → array de resúmenes anteriores (últimos 7 días)
 * - `loadHistory()` → carga el histórico bajo demanda
 */
export function useDigest(userToken?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioState, setAudioState] = useState<DigestAudioState>('idle')
  const [historyEnabled, setHistoryEnabled] = useState(false)

  // Resumen del día — se carga cuando play() es llamado la primera vez
  const digestQuery = useQuery({
    queryKey: ['digest', userToken],
    queryFn: () => fetchDigest(userToken),
    enabled: false,           // on-demand — no se carga al montar
    staleTime: 60 * 60 * 1000, // 1h stale (backend cachea hasta medianoche)
    retry: 1,
  })

  // Histórico — cargado solo cuando loadHistory() es llamado
  const historyQuery = useQuery({
    queryKey: ['digest-history', userToken],
    queryFn: () => fetchDigestHistory(userToken),
    enabled: historyEnabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const stop = useCallback(() => {
    audioRef.current?.pause()
    if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src)
    audioRef.current = null
    setAudioState('idle')
  }, [])

  const play = useCallback(async () => {
    // Toggle off si está reproduciendo
    if (audioState === 'playing') { stop(); return }
    if (audioState === 'loading') return

    setAudioState('loading')

    try {
      // 1. Obtener resumen (usa caché de react-query si ya está disponible)
      const digestResult = await digestQuery.refetch()
      const data = digestResult.data
      if (!data?.ok || !data.text) throw new Error('digest_empty')

      // 2. Solicitar TTS
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: data.text }),
      })

      if (!ttsRes.ok) {
        // TTS no disponible — al menos el texto está listo
        setAudioState('idle')
        return
      }

      const blob = await ttsRes.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setAudioState('idle')
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setAudioState('error')
        setTimeout(() => setAudioState('idle'), 3000)
      }

      await audio.play()
      setAudioState('playing')
    } catch {
      setAudioState('error')
      setTimeout(() => setAudioState('idle'), 3000)
    }
  }, [audioState, digestQuery, stop])

  const loadHistory = useCallback(() => {
    setHistoryEnabled(true)
  }, [])

  return {
    /** Datos del resumen del día */
    digest: digestQuery.data,
    /** Si el resumen está siendo cargado (HTTP) */
    isLoading: digestQuery.isFetching,
    /** Error al cargar el resumen */
    error: digestQuery.error,
    /** Estado del audio: 'idle' | 'loading' | 'playing' | 'error' */
    audioState,
    /** Iniciar/detener la reproducción del resumen */
    play,
    /** Detener el audio */
    stop,
    /** Histórico de los últimos 7 días */
    history: historyQuery.data?.entries ?? [],
    /** Si el histórico está cargando */
    historyLoading: historyQuery.isFetching,
    /** Carga el histórico bajo demanda */
    loadHistory,
  }
}
