import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { youtubeSearch, youtubeStream, youtubeProxyUrl, type YouTubeResult } from '../api/client'

const SUGGESTIONS = ['música cubana', 'noticias Cuba', 'tutoriales programación', 'salsa latina', 'documentales', 'películas completas']

function fmtDuration(secs: number): string {
  if (!secs) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

function fmtViews(n: number): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M vistas`
  if (n >= 1_000)     return `${(n/1_000).toFixed(0)}K vistas`
  return `${n} vistas`
}

function VideoModal({ result, streamSource, onClose }: { result: YouTubeResult & { streamUrl?: string }; streamSource?: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0d1117] border border-[rgba(56,139,253,0.3)] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(56,139,253,0.15)]">
          <h3 className="text-sm font-medium text-[#e6edf3] truncate mr-4">{result.title}</h3>
          <button onClick={onClose} className="flex-shrink-0 text-muted hover:text-[#e6edf3] text-lg leading-none">✕</button>
        </div>

        {result.streamUrl && streamSource === 'embed' ? (
          <iframe
            src={result.streamUrl}
            className="w-full aspect-video bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : result.streamUrl ? (
          <video
            src={youtubeProxyUrl(result.streamUrl)}
            controls
            autoPlay
            className="w-full aspect-video bg-black"
          />
        ) : (
          <div className="aspect-video bg-black flex items-center justify-center">
            <div className="text-center text-muted">
              <div className="text-4xl mb-2">▶</div>
              <p className="text-sm">Stream no disponible</p>
            </div>
          </div>
        )}

        <div className="px-4 py-3">
          <p className="text-muted text-xs">{result.author} · {result.published}</p>
        </div>
      </div>
    </div>
  )
}

function VideoCard({ result }: { result: YouTubeResult }) {
  const [imgError, setImgError] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [streamSource, setStreamSource] = useState<string | undefined>()
  const [showModal, setShowModal] = useState(false)

  const streamMutation = useMutation({
    mutationFn: () => youtubeStream(result.id),
    onSuccess: data => {
      setStreamUrl(data.stream_url)
      setStreamSource(data.source)
      setShowModal(true)
    },
  })

  return (
    <>
      <div className="rounded-xl border border-[rgba(56,139,253,0.15)] bg-[rgba(22,27,34,0.6)] overflow-hidden hover:border-accent/30 transition-all">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-[rgba(56,139,253,0.05)]">
          {result.thumbnail_url && !imgError ? (
            <img
              src={result.thumbnail_url}
              alt={result.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-4xl text-muted/30">▶</div>
          )}
          {result.duration_sec > 0 && (
            <span className="absolute bottom-2 right-2 text-xs bg-black/80 text-white px-1.5 py-0.5 rounded">
              {fmtDuration(result.duration_sec)}
            </span>
          )}
          {/* Play overlay */}
          <button
            onClick={() => {
              if (streamUrl) setShowModal(true)
              else streamMutation.mutate()
            }}
            disabled={streamMutation.isPending}
            className="absolute inset-0 bg-black/0 hover:bg-black/30 flex items-center justify-center transition-all group"
          >
            <span className="w-14 h-14 rounded-full bg-black/60 border-2 border-white/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {streamMutation.isPending
                ? <span className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : '▶'}
            </span>
          </button>
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          <h3 className="text-sm text-[#e6edf3] font-medium line-clamp-2 leading-snug">{result.title}</h3>
          <div className="flex items-center justify-between">
            <span className="text-muted text-xs truncate">{result.author}</span>
            {(result.view_count ?? 0) > 0 && (
              <span className="text-muted/60 text-xs flex-shrink-0 ml-1">{fmtViews(result.view_count!)}</span>
            )}
          </div>
          {result.published && <p className="text-muted/50 text-xs">{result.published}</p>}

          {streamMutation.isError && (
            <p className="text-red-400 text-xs">Error obteniendo stream — intenta de nuevo</p>
          )}

          <button
            onClick={() => {
              if (streamUrl) setShowModal(true)
              else streamMutation.mutate()
            }}
            disabled={streamMutation.isPending}
            className="w-full mt-1 py-1.5 text-xs rounded-lg border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {streamMutation.isPending ? (
              <><span className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" /> Obteniendo stream…</>
            ) : streamUrl ? '▶ Reproducir' : '▶ Obtener stream'}
          </button>
        </div>
      </div>

      {showModal && (
        <VideoModal
          result={{ ...result, streamUrl: streamUrl ?? undefined }}
          streamSource={streamSource}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

export function YouTubePage() {
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['youtubeSearch', query],
    queryFn: () => youtubeSearch(query, 15),
    staleTime: 15 * 60_000,
    enabled: query.length > 0,
  })

  const results: YouTubeResult[] = data?.results ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#e6edf3]">YouTube</h2>
        <p className="text-muted text-sm mt-0.5">Búsqueda via Invidious · Sin cuenta requerida</p>
      </div>

      {/* Búsqueda */}
      <form onSubmit={e => { e.preventDefault(); setQuery(input.trim()) }} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Buscar videos…"
          className="flex-1 bg-[rgba(22,27,34,0.8)] border border-[rgba(56,139,253,0.3)] text-[#e6edf3] rounded-lg px-3 py-2 text-sm placeholder-muted/50 focus:outline-none focus:border-accent/70"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded-lg text-sm transition disabled:opacity-50"
        >
          {isLoading ? <span className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" /> : 'Buscar'}
        </button>
      </form>

      {/* Sugerencias */}
      {!query && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => { setInput(s); setQuery(s) }}
              className="px-2.5 py-1 rounded-full text-xs border border-[rgba(56,139,253,0.2)] bg-[rgba(22,27,34,0.5)] text-muted hover:text-accent hover:border-accent/50 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          Error buscando: {String(error)} — Las instancias de Invidious pueden estar ocupadas. Intenta de nuevo.
        </div>
      )}

      {/* Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl bg-[rgba(56,139,253,0.05)] border border-[rgba(56,139,253,0.1)] overflow-hidden">
              <div className="aspect-video bg-[rgba(56,139,253,0.08)]" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-[rgba(56,139,253,0.08)] rounded" />
                <div className="h-2 w-2/3 bg-[rgba(56,139,253,0.06)] rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resultados */}
      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">{results.length} resultados para "<span className="text-[#e6edf3]">{data?.query}</span>"</span>
            {(data as any)?.cached && <span className="text-xs text-muted/50">desde caché</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map(r => <VideoCard key={r.id} result={r} />)}
          </div>
        </>
      )}

      {!isLoading && query && results.length === 0 && !error && (
        <div className="text-center py-10 text-muted">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm">Sin resultados para "{query}"</p>
        </div>
      )}

      <div className="text-center text-muted/50 text-xs pt-2 border-t border-[rgba(56,139,253,0.1)]">
        Búsqueda vía <span className="text-accent/60">InnerTube</span> · Reproducción vía <span className="text-accent/60">YouTube Embed</span>
      </div>
    </div>
  )
}
