import { Play, Square } from 'lucide-react'
import { useDigest } from '../hooks/useDigest'

function userTokenFromStorage(): string | undefined {
  try { return localStorage.getItem('rauli_user_token') ?? undefined } catch { return undefined }
}

export function DigestPanel() {
  const { digest, audioState, play } = useDigest(userTokenFromStorage())
  const isPlaying = audioState === 'playing'
  const isLoading = audioState === 'loading'

  return (
    <div className="relative group">
      {/* Glow border */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl blur-sm opacity-20 group-hover:opacity-40 transition-opacity duration-300" />

      <div className="relative bg-black/50 ring-1 ring-white/10 rounded-xl px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[#00f2ff] uppercase tracking-wider">
            Resumen del Día
          </span>
          {digest?.temp_c && (
            <span className="text-[10px] text-white/35">☀ La Habana {digest.temp_c}</span>
          )}
        </div>

        {/* Texto del resumen */}
        {digest?.text ? (
          <p className="text-slate-300 text-xs leading-relaxed italic mb-3">
            &ldquo;{digest.text}&rdquo;
          </p>
        ) : (
          <p className="text-white/25 text-xs italic mb-3">
            Pulsa para generar el resumen de hoy…
          </p>
        )}

        {/* Botón de audio */}
        <button
          onClick={() => play()}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[#00f2ff] hover:text-white transition-colors disabled:opacity-40"
        >
          {isLoading ? (
            <span className="h-3 w-3 rounded-full border-2 border-[#00f2ff] border-t-transparent animate-spin" />
          ) : isPlaying ? (
            <>
              <Square size={10} className="fill-current" />
              <span className="flex gap-0.5 items-end h-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-0.5 bg-[#00f2ff] rounded-full animate-pulse"
                    style={{ height: `${5 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </>
          ) : (
            <Play size={10} className="fill-current" />
          )}
          <span>
            {isLoading ? 'Generando…' : isPlaying ? 'Detener' : 'ESCUCHAR RESUMEN'}
          </span>
        </button>
      </div>
    </div>
  )
}
