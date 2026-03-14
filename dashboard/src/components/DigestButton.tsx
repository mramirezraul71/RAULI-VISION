import { useState } from 'react'
import { useDigest } from '../hooks/useDigest'

function userTokenFromStorage(): string | undefined {
  try { return localStorage.getItem('rauli_user_token') ?? undefined } catch { return undefined }
}

export function DigestButton() {
  const [open, setOpen] = useState(false)
  const { digest, audioState, play, stop } = useDigest(userTokenFromStorage())

  const handleClick = async () => {
    if (!open && audioState === 'idle') setOpen(true)
    await play()
  }

  const handleClose = () => { setOpen(false); stop() }

  const btnLabel: Record<string, string> = {
    idle:    '📰 Resumen del Día',
    loading: 'Generando…',
    playing: '⏹ Detener',
    error:   '⚠ Error — reintentar',
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={audioState === 'loading'}
        title="Escuchar el resumen de noticias y clima del día"
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition whitespace-nowrap disabled:opacity-50 ${
          audioState === 'playing'
            ? 'border-accent/60 text-accent bg-accent/10'
            : audioState === 'error'
            ? 'border-red-500/40 text-red-400'
            : 'border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50'
        }`}
      >
        {audioState === 'loading' && (
          <span className="h-3 w-3 rounded-full border-2 border-muted border-t-transparent animate-spin" />
        )}
        {audioState === 'playing' && (
          <span className="flex gap-0.5 items-end h-3.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-0.5 bg-accent rounded-full animate-pulse"
                style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        )}
        <span>{btnLabel[audioState]}</span>
      </button>

      {/* Panel inline — sin posicionamiento fijo, nunca se sale de límites */}
      {open && digest?.text && (
        <div className="rounded-xl border border-[rgba(56,139,253,0.35)] bg-[rgba(13,17,23,0.95)] p-3">
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-accent tracking-wide uppercase">Resumen</span>
              {digest.temp_c && (
                <span className="text-[10px] text-muted/60">☀ {digest.temp_c}</span>
              )}
              {digest.from_store && (
                <span className="text-[10px] text-muted/40">(histórico)</span>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-muted/60 hover:text-[#e6edf3] transition text-base leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 flex-shrink-0"
              aria-label="Cerrar"
            >×</button>
          </div>

          <p className="text-xs text-[#e6edf3] leading-relaxed">{digest.text}</p>

          {audioState === 'playing' && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-accent/80">
              <span className="flex gap-0.5 items-end h-3">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-0.5 bg-accent rounded-full animate-pulse"
                    style={{ height: `${4 + i * 2}px`, animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              <span>Reproduciendo…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
