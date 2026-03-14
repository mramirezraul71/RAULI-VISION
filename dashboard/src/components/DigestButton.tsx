import { useState, useRef } from 'react'

interface DigestResponse {
  ok: boolean
  text: string
  city: string
  temp_c?: string
  cached_at: string
}

export function DigestButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setState('idle')
  }

  const handleClick = async () => {
    if (state === 'playing') { stop(); return }
    if (state === 'loading') return

    setState('loading')
    try {
      // 1. Obtener el resumen del día
      const digestRes = await fetch(`/api/digest`)
      if (!digestRes.ok) throw new Error('digest_error')
      const digest: DigestResponse = await digestRes.json()
      if (!digest.ok || !digest.text) throw new Error('digest_empty')
      setText(digest.text)
      setOpen(true)

      // 2. Solicitar síntesis de voz (TTS)
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: digest.text }),
      })

      if (!ttsRes.ok) {
        // TTS no disponible — mostrar texto igual
        setState('idle')
        return
      }

      const blob = await ttsRes.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => { setState('idle'); URL.revokeObjectURL(url) }
      audio.onerror = () => { setState('idle'); URL.revokeObjectURL(url) }
      audio.play()
      setState('playing')
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const btnLabel = {
    idle: '📰 Resumen del Día',
    loading: 'Generando…',
    playing: '⏹ Detener',
    error: '⚠ Error — reintentar',
  }[state]

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'loading'}
        title="Escuchar el resumen de noticias y clima del día"
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition whitespace-nowrap disabled:opacity-50 ${
          state === 'playing'
            ? 'border-accent/60 text-accent bg-accent/10'
            : state === 'error'
            ? 'border-red-500/40 text-red-400'
            : 'border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50'
        }`}
      >
        {state === 'loading' && (
          <span className="h-3 w-3 rounded-full border-2 border-muted border-t-transparent animate-spin" />
        )}
        {state === 'playing' && (
          <span className="flex gap-0.5 items-end h-3.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-0.5 bg-accent rounded-full animate-pulse"
                style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}
        <span>{btnLabel}</span>
      </button>

      {/* Panel flotante con el texto del resumen */}
      {open && text && (
        <div
          className="fixed inset-x-4 bottom-24 md:bottom-6 md:right-6 md:left-auto md:max-w-sm z-50
                     bg-[rgba(13,17,23,0.97)] border border-[rgba(56,139,253,0.35)] rounded-2xl
                     shadow-2xl shadow-black/60 p-4"
          style={{ animation: 'slideUpFade 0.2s ease-out' }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-accent tracking-wide uppercase">Resumen del Día</span>
            <button
              onClick={() => { setOpen(false); stop() }}
              className="text-muted/60 hover:text-[#e6edf3] transition text-lg leading-none -mt-0.5"
              aria-label="Cerrar"
            >×</button>
          </div>
          <p className="text-sm text-[#e6edf3] leading-relaxed">{text}</p>
          {state === 'playing' && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-accent/80">
              <span className="flex gap-0.5 items-end h-3">
                {[0, 1, 2, 3].map(i => (
                  <span key={i} className="w-0.5 bg-accent rounded-full animate-pulse"
                    style={{ height: `${4 + (i % 3) * 3}px`, animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              <span>Reproduciendo voz de ATLAS…</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
