import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tiktokFetch, tiktokStatus, tiktokStreamUrl, type TikTokVideoInfo } from '../api/client'

// ─── sub-components ──────────────────────────────────────────────────────────

function ProxyStatusBar() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tiktokStatus'],
    queryFn: tiktokStatus,
    staleTime: 60_000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted animate-pulse">
        <span className="h-2 w-2 rounded-full bg-muted/50 inline-block" />
        Verificando proxy...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border border-red-400/40 bg-red-500/10 text-red-300">
        ✕ Proxy no disponible
      </span>
    )
  }

  return (
    <div className="space-y-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
          data.available
            ? 'border-green-400/50 bg-green-500/12 text-green-300'
            : 'border-yellow-400/50 bg-yellow-500/12 text-yellow-300'
        }`}
      >
        {data.available ? '● Proxy operativo' : '○ Modo limitado'}
      </span>
      {!data.available && (
        <p className="text-xs text-yellow-300/80 rounded-lg border border-yellow-400/20 bg-yellow-500/8 px-3 py-2">
          <strong>yt-dlp no detectado</strong> en el servidor espejo. El administrador debe instalarlo:{' '}
          <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono text-yellow-200">pip install yt-dlp</code>
          <br />
          <span className="text-yellow-200/60 mt-0.5 block">
            Mientras tanto, los canales de compilaciones YouTube siguen disponibles.
          </span>
        </p>
      )}
    </div>
  )
}

function VideoResult({ info, onStream }: { info: TikTokVideoInfo; onStream: () => void }) {
  const mins = Math.floor(info.duration_sec / 60)
  const secs = (info.duration_sec % 60).toString().padStart(2, '0')
  const hasDuration = info.duration_sec > 0

  return (
    <div className="rounded-xl border border-accent/40 bg-[rgba(22,27,34,0.95)] overflow-hidden">
      {info.thumbnail_url && (
        <img
          src={info.thumbnail_url}
          alt={info.title}
          className="w-full max-h-56 object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      )}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-[#e6edf3] leading-snug text-base">
            {info.title || '(sin título)'}
          </h3>
          <p className="text-muted text-sm mt-1 flex items-center gap-2 flex-wrap">
            <span>@{info.uploader || 'desconocido'}</span>
            {hasDuration && (
              <>
                <span className="text-muted/40">·</span>
                <span>{mins}:{secs}</span>
              </>
            )}
            <span className="rounded-full bg-green-500/15 text-green-300 text-xs px-2 py-0.5 ml-1">
              Listo via espejo
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={onStream}
            className="rounded-lg bg-accent/20 text-accent border border-accent/30 px-5 py-2 text-sm font-semibold hover:bg-accent/30 active:scale-95 transition"
          >
            ▶ Reproducir via espejo
          </button>
          <a
            href={info.original_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[rgba(56,139,253,0.35)] px-4 py-2 text-sm text-muted hover:text-accent hover:border-accent/50 transition"
          >
            Abrir en TikTok ↗
          </a>
        </div>

        <p className="text-xs text-muted/70 border-t border-[rgba(56,139,253,0.15)] pt-2 mt-1">
          <strong className="text-muted">Reproducir via espejo</strong> retransmite el video a través del servidor — tu dispositivo no se conecta a TikTok directamente.
        </p>
      </div>
    </div>
  )
}

function StreamPlayer({ proxyUrl, onClose }: { proxyUrl: string; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-accent/50 bg-[rgba(13,17,23,0.98)] overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(56,139,253,0.2)]">
        <span className="text-accent text-sm font-semibold flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse inline-block" />
          Reproduciendo via espejo
        </span>
        <button
          onClick={onClose}
          className="text-muted hover:text-[#e6edf3] text-lg leading-none transition px-1"
          aria-label="Cerrar reproductor"
        >
          ×
        </button>
      </div>
      <video
        src={proxyUrl}
        controls
        autoPlay
        className="w-full bg-black"
        style={{ maxHeight: '420px' }}
      >
        Tu navegador no soporta reproducción de video HTML5.
      </video>
      <p className="text-xs text-muted/60 px-4 py-2 border-t border-[rgba(56,139,253,0.1)]">
        Datos: espejo → tu dispositivo · TikTok no recibe tu IP
      </p>
    </div>
  )
}

function UrlFetcher({
  onResult,
}: {
  onResult: (info: TikTokVideoInfo) => void
}) {
  const [url, setUrl] = useState('')

  const mutation = useMutation({
    mutationFn: (rawUrl: string) => tiktokFetch(rawUrl),
    onSuccess: (info) => {
      onResult(info)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    mutation.mutate(trimmed)
  }

  const examples = [
    'https://www.tiktok.com/@usuario/video/123...',
    'https://vm.tiktok.com/XXXXX/',
    'https://vt.tiktok.com/XXXXX/',
  ]

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={examples[0]}
          className="flex-1 min-w-[260px] rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none text-sm font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={mutation.isPending || !url.trim()}
          className="rounded-lg bg-accent/20 text-accent border border-accent/20 px-5 py-2.5 font-semibold hover:bg-accent/30 disabled:opacity-50 active:scale-95 transition text-sm"
        >
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
              Obteniendo...
            </span>
          ) : (
            'Obtener video'
          )}
        </button>
      </form>

      <p className="text-xs text-muted/70">
        Formatos aceptados:{' '}
        {examples.map((ex, i) => (
          <span key={i}>
            <code className="bg-[rgba(56,139,253,0.1)] px-1 rounded text-accent/80 font-mono">{ex.split('/')[2]}/…</code>
            {i < examples.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>

      {mutation.isError && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/8 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{mutation.error instanceof Error ? mutation.error.message : 'Error al obtener el video. Verifica la URL.'}</span>
        </div>
      )}
    </div>
  )
}

const YOUTUBE_TIKTOK_CHANNELS = [
  {
    id: 'viral_es',
    title: 'TikTok Viral · Español',
    description: 'Los más vistos en español cada semana',
    url: 'https://www.youtube.com/results?search_query=tiktok+viral+espanol+2024',
    tag: 'Entretenimiento',
  },
  {
    id: 'musica_cuba',
    title: 'Música y Baile · Cuba',
    description: 'Tendencias de música y baile cubano',
    url: 'https://www.youtube.com/results?search_query=musica+cubana+viral+tiktok',
    tag: 'Música',
  },
  {
    id: 'humor',
    title: 'Humor TikTok Latino',
    description: 'Los mejores videos de humor en español',
    url: 'https://www.youtube.com/results?search_query=tiktok+humor+latino+viral',
    tag: 'Humor',
  },
  {
    id: 'challenges',
    title: 'Challenges y Baile',
    description: 'Los retos y coreografías del momento',
    url: 'https://www.youtube.com/results?search_query=tiktok+challenge+baile+2024',
    tag: 'Baile',
  },
]

// ─── main page ───────────────────────────────────────────────────────────────

export function TikTokPage() {
  const [result, setResult] = useState<TikTokVideoInfo | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const handleResult = (info: TikTokVideoInfo) => {
    setResult(info)
    setStreamUrl(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleStream = () => {
    if (!result) return
    setStreamUrl(tiktokStreamUrl(result.stream_url))
  }

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-accent font-bold text-xl tracking-tight">TikTok · Acceso via Espejo</h2>
            <p className="text-muted text-sm max-w-lg">
              El servidor espejo actúa de intermediario: obtiene el video de TikTok y lo retransmite a tu dispositivo.
              Útil en regiones donde <code className="text-accent/80 font-mono bg-accent/10 px-1 rounded">tiktok.com</code> está bloqueado.
            </p>
          </div>
          <ProxyStatusBar />
        </div>
      </section>

      {/* ── Reproductor activo (si hay stream) ─────────────────────────────── */}
      {streamUrl && (
        <StreamPlayer proxyUrl={streamUrl} onClose={() => setStreamUrl(null)} />
      )}

      {/* ── Resultado del fetch ─────────────────────────────────────────────── */}
      {result && !streamUrl && (
        <VideoResult info={result} onStream={handleStream} />
      )}

      {/* ── Obtener video por URL ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur space-y-1">
        <h3 className="text-[#e6edf3] font-semibold mb-0.5">Pegar enlace de TikTok</h3>
        <p className="text-muted text-xs mb-3">
          Copia el enlace desde TikTok (desde otro dispositivo o red) y pégalo aquí.
        </p>
        <UrlFetcher onResult={handleResult} />
      </section>

      {/* ── Canales compilación (siempre disponibles) ───────────────────────── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="mb-4">
          <h3 className="text-[#e6edf3] font-semibold">Compilaciones TikTok via YouTube</h3>
          <p className="text-muted text-xs mt-0.5">
            Accesibles directamente desde Cuba · No requieren yt-dlp
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {YOUTUBE_TIKTOK_CHANNELS.map((ch) => (
            <a
              key={ch.id}
              href={ch.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-lg border border-[rgba(56,139,253,0.2)] bg-[rgba(56,139,253,0.04)] p-3.5 hover:border-accent/50 hover:bg-accent/8 transition block"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm text-[#e6edf3] group-hover:text-accent transition leading-snug">
                  {ch.title}
                </p>
                <span className="flex-shrink-0 text-xs rounded-full border border-[rgba(56,139,253,0.3)] text-muted px-2 py-0.5">
                  {ch.tag}
                </span>
              </div>
              <p className="text-muted text-xs mt-1">{ch.description}</p>
              <span className="mt-2 inline-block rounded-full bg-green-500/12 text-green-300 text-xs px-2 py-0.5 border border-green-400/25">
                ✓ Cuba OK
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.15)] bg-[rgba(22,27,34,0.5)] p-4">
        <h3 className="text-muted font-semibold text-sm mb-2.5">Cómo funciona el proxy</h3>
        <ol className="space-y-1.5 text-xs text-muted list-none pl-0">
          {[
            ['1', 'Copias el enlace del video en TikTok desde otro dispositivo o red.'],
            ['2', 'Lo pegas arriba y pulsas Obtener video.'],
            ['3', 'El servidor espejo (fuera de Cuba) usa yt-dlp para extraer la URL de stream.'],
            ['4', 'Pulsas Reproducir via espejo — el video llega a ti sin pasar por TikTok.'],
          ].map(([n, text]) => (
            <li key={n} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 h-5 w-5 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs flex items-center justify-center font-semibold">
                {n}
              </span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </section>

    </div>
  )
}
