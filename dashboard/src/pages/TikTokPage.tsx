import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  tiktokFetch, tiktokStatus, tiktokStreamUrl,
  tiktokTrending, tiktokTrendingLive, tiktokSearch,
  type TikTokVideoInfo, type TikTokFeedItem,
} from '../api/client'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(sec: number) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function fmtCount(n?: number) {
  if (!n) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── video card ───────────────────────────────────────────────────────────────

function VideoCard({
  item, onPlay,
}: {
  item: TikTokFeedItem
  onPlay: (item: TikTokFeedItem) => void
}) {
  const dur = fmtDuration(item.duration_sec)
  const likes = fmtCount(item.digg_count)

  return (
    <div className="group relative rounded-xl border border-[rgba(56,139,253,0.2)] bg-[rgba(22,27,34,0.95)] overflow-hidden hover:border-accent/50 transition-all hover:shadow-[0_0_20px_rgba(56,139,253,0.12)] flex flex-col">
      {/* Thumbnail */}
      <div className="relative overflow-hidden bg-[#0d1117] aspect-[9/16] max-h-52 sm:max-h-64">
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted/30 text-3xl">▶</div>
        )}
        {/* Overlay play */}
        <button
          onClick={() => onPlay(item)}
          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
          aria-label="Reproducir"
        >
          <span className="h-12 w-12 rounded-full border-2 border-white/80 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-lg pl-0.5">
            ▶
          </span>
        </button>
        {dur && (
          <span className="absolute bottom-1.5 right-2 text-[10px] font-mono bg-black/70 text-white/90 px-1.5 py-0.5 rounded">
            {dur}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm text-[#e6edf3] font-medium leading-snug line-clamp-2">
          {item.title || '(sin título)'}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
          {item.avatar ? (
            <img src={item.avatar} alt="" className="h-5 w-5 rounded-full object-cover flex-shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          ) : null}
          <span className="text-xs text-muted truncate">@{item.uploader || 'desconocido'}</span>
          {likes && (
            <span className="ml-auto text-xs text-muted/70 flex items-center gap-1">
              <span className="text-red-400">♥</span>{likes}
            </span>
          )}
        </div>
        <button
          onClick={() => onPlay(item)}
          className="mt-1 w-full rounded-lg border border-accent/25 bg-accent/8 text-accent text-xs font-semibold py-1.5 hover:bg-accent/20 active:scale-95 transition"
        >
          ▶ Reproducir via espejo
        </button>
      </div>
    </div>
  )
}

// ─── inline player ────────────────────────────────────────────────────────────

function InlinePlayer({
  item, proxyUrl, onClose,
}: {
  item: TikTokFeedItem
  proxyUrl: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-2xl border border-accent/40 bg-[#0d1117] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(56,139,253,0.2)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
            <span className="text-accent text-xs font-semibold truncate">{item.title || 'TikTok via espejo'}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#e6edf3] text-xl leading-none ml-2 flex-shrink-0">×</button>
        </div>

        <video
          src={proxyUrl}
          controls
          autoPlay
          className="w-full bg-black"
          style={{ maxHeight: '70vh' }}
          playsInline
        >
          Tu navegador no soporta video HTML5.
        </video>

        <div className="px-4 py-2.5 flex items-center justify-between text-xs text-muted/60 border-t border-[rgba(56,139,253,0.1)]">
          <span>@{item.uploader}</span>
          <span>Espejo → dispositivo · IP Cuba protegida</span>
        </div>
      </div>
    </div>
  )
}

// ─── status bar ───────────────────────────────────────────────────────────────

function ProxyStatusBadge() {
  const { data, isLoading } = useQuery({
    queryKey: ['tiktokStatus'],
    queryFn: tiktokStatus,
    staleTime: 60_000,
    retry: 1,
  })

  if (isLoading) return <span className="text-xs text-muted animate-pulse">verificando...</span>

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
      data?.available
        ? 'border-green-400/50 bg-green-500/12 text-green-300'
        : 'border-yellow-400/50 bg-yellow-500/12 text-yellow-300'
    }`}>
      {data?.available ? '● Proxy operativo' : '○ Modo limitado'}
    </span>
  )
}

// ─── tendencias tab ───────────────────────────────────────────────────────────

function TrendingTab({ onPlay }: { onPlay: (item: TikTokFeedItem) => void }) {
  const [items, setItems] = useState<TikTokFeedItem[]>([])
  const [pending, setPending] = useState<TikTokFeedItem[]>([])
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // REST fallback: carga tendencias por HTTP cuando SSE falla o no llega a tiempo
  const fetchViaRest = useCallback(async () => {
    try {
      const data = await tiktokTrending(20)
      if (data.items.length > 0) {
        const at = data.cached_at ?? new Date().toISOString()
        setItems(prev => {
          if (prev.length === 0) { setCachedAt(at); hasDataRef.current = true; return data.items }
          setPending(data.items)
          setCachedAt(at)
          return prev
        })
        setConnected(true)
        setError(null)
      }
    } catch { /* ignore — reintenta en siguiente ciclo */ }
  }, [])

  useEffect(() => {
    setError(null)
    hasDataRef.current = false

    // Si SSE no entrega datos en 5 s (ej. Cloudflare bloquea SSE), fallback a REST
    const fallbackTimeout = setTimeout(() => {
      if (!hasDataRef.current) {
        setError(null)
        fetchViaRest()
        // Actualización automática cada 5 minutos via REST
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(fetchViaRest, 5 * 60_000)
        }
      }
    }, 5000)

    const es = tiktokTrendingLive(
      (newItems, at) => {
        clearTimeout(fallbackTimeout)
        hasDataRef.current = true
        setItems(newItems)
        setCachedAt(at)
        setConnected(true)
        setError(null)
      },
      (newItems, at) => {
        // Si aún no hay nada mostrado, cargar directamente; si ya hay items, mostrar banner
        setItems(prev => {
          if (prev.length === 0) { setCachedAt(at); return newItems }
          setPending(newItems)
          setCachedAt(at)
          return prev
        })
      },
    )
    es.onerror = () => {
      setConnected(false)
      if (!hasDataRef.current) {
        clearTimeout(fallbackTimeout)
        setError('Feed en tiempo real no disponible. Cargando en modo alternativo...')
        fetchViaRest()
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(fetchViaRest, 5 * 60_000)
        }
      }
    }
    return () => {
      clearTimeout(fallbackTimeout)
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      es.close()
    }
  }, [fetchViaRest])

  const applyPending = () => {
    setItems(pending)
    setPending([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Skeleton mientras carga
  if (!connected && items.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted animate-pulse">
          <span className="h-2 w-2 rounded-full bg-accent/50 inline-block" />
          Conectando al feed en tiempo real...
        </div>
        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">{error}</div>
        )}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[rgba(56,139,253,0.1)] bg-[rgba(22,27,34,0.6)] overflow-hidden animate-pulse">
              <div className="aspect-[9/16] max-h-52 bg-[rgba(56,139,253,0.06)]" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-[rgba(56,139,253,0.1)] rounded w-3/4" />
                <div className="h-2.5 bg-[rgba(56,139,253,0.07)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra de estado del feed en tiempo real */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full inline-block ${connected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-muted">
            {connected ? 'Feed en vivo' : 'Reconectando...'}
          </span>
          {cachedAt && (
            <span className="text-muted/50">
              · actualizado {new Date(cachedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span className="text-xs text-muted/50">Se actualiza cada 5 min · via espejo</span>
      </div>

      {/* Banner de nuevos videos disponibles */}
      {pending.length > 0 && (
        <button
          onClick={applyPending}
          className="w-full rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent font-semibold hover:bg-accent/18 active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <span className="h-2 w-2 rounded-full bg-accent animate-ping inline-block" />
          {pending.length} nuevos videos disponibles — toca para actualizar
        </button>
      )}

      {/* Grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <VideoCard key={item.id} item={item} onPlay={onPlay} />
        ))}
      </div>
    </div>
  )
}

// ─── buscar tab ───────────────────────────────────────────────────────────────

function SearchTab({ onPlay }: { onPlay: (item: TikTokFeedItem) => void }) {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [cursor, setCursor] = useState('')
  const [allItems, setAllItems] = useState<TikTokFeedItem[]>([])
  const [nextCursor, setNextCursor] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: searchData, isLoading, isError, error } = useQuery({
    queryKey: ['tiktokSearch', submittedQuery, cursor],
    queryFn: () => tiktokSearch(submittedQuery, 20, cursor),
    enabled: submittedQuery.length > 0,
    staleTime: 3 * 60_000,
  })

  useEffect(() => {
    if (!searchData) return
    setAllItems(prev => cursor ? [...prev, ...searchData.items] : searchData.items)
    setNextCursor(searchData.cursor)
    setHasMore(searchData.has_more)
  }, [searchData]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q || q === submittedQuery) return
    setAllItems([])
    setCursor('')
    setNextCursor('')
    setHasMore(false)
    setSubmittedQuery(q)
  }

  const SUGGESTIONS = ['música cubana', 'humor latino', 'baile reggaeton', 'cocina cubana', 'viral 2025']

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en TikTok... ej: música cubana, humor latino"
          className="flex-1 rounded-xl border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted/50 focus:border-accent focus:outline-none text-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="rounded-xl bg-accent/20 text-accent border border-accent/25 px-5 py-2.5 font-semibold text-sm hover:bg-accent/30 disabled:opacity-50 active:scale-95 transition"
        >
          {isLoading && submittedQuery ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Buscando
            </span>
          ) : 'Buscar'}
        </button>
      </form>

      {/* Suggestions */}
      {!submittedQuery && (
        <div className="space-y-2">
          <p className="text-xs text-muted/70">Búsquedas sugeridas:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuery(s)
                  setAllItems([])
                  setCursor('')
                  setNextCursor('')
                  setHasMore(false)
                  setSubmittedQuery(s)
                }}
                className="rounded-full border border-[rgba(56,139,253,0.25)] bg-[rgba(56,139,253,0.06)] text-muted text-xs px-3 py-1 hover:border-accent/50 hover:text-accent transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-400/25 bg-red-500/8 p-4 text-sm text-red-300">
          {error instanceof Error ? error.message : 'Búsqueda fallida'}
        </div>
      )}

      {/* Results */}
      {allItems.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted/70">
            {allItems.length} resultados para <span className="text-accent font-medium">"{submittedQuery}"</span>
          </p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {allItems.map((item) => (
              <VideoCard key={item.id} item={item} onPlay={onPlay} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setCursor(nextCursor)}
                disabled={isLoading}
                className="rounded-xl border border-accent/30 bg-accent/8 text-accent px-6 py-2.5 text-sm font-semibold hover:bg-accent/18 disabled:opacity-50 active:scale-95 transition"
              >
                {isLoading ? 'Cargando...' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {submittedQuery && !isLoading && allItems.length === 0 && !isError && (
        <div className="rounded-xl border border-[rgba(56,139,253,0.15)] bg-[rgba(22,27,34,0.5)] p-8 text-center">
          <p className="text-muted text-sm">No se encontraron videos para "{submittedQuery}"</p>
          <p className="text-muted/50 text-xs mt-1">Prueba con otras palabras clave</p>
        </div>
      )}
    </div>
  )
}

// ─── por URL tab ──────────────────────────────────────────────────────────────

function UrlTab({ onResult }: { onResult: (info: TikTokVideoInfo) => void }) {
  const [url, setUrl] = useState('')

  const mutation = useMutation({
    mutationFn: (rawUrl: string) => tiktokFetch(rawUrl),
    onSuccess: onResult,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    mutation.mutate(trimmed)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[rgba(56,139,253,0.2)] bg-[rgba(22,27,34,0.5)] p-4 text-sm text-muted">
        <p className="font-medium text-[#e6edf3] mb-1">¿Cómo consigo el enlace?</p>
        <p>Desde otro dispositivo con acceso a TikTok, abre el video → toca "Compartir" → "Copiar enlace". Luego pégalo aquí.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@usuario/video/123..."
          className="flex-1 min-w-[260px] rounded-xl border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted/50 focus:border-accent focus:outline-none text-sm font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={mutation.isPending || !url.trim()}
          className="rounded-xl bg-accent/20 text-accent border border-accent/20 px-5 py-2.5 font-semibold hover:bg-accent/30 disabled:opacity-50 active:scale-95 transition text-sm"
        >
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Obteniendo...
            </span>
          ) : 'Obtener video'}
        </button>
      </form>

      <p className="text-xs text-muted/60">
        Formatos: <code className="font-mono text-accent/70">tiktok.com/@usuario/video/…</code>,{' '}
        <code className="font-mono text-accent/70">vm.tiktok.com/…</code>,{' '}
        <code className="font-mono text-accent/70">vt.tiktok.com/…</code>
      </p>

      {mutation.isError && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/8 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <span className="flex-shrink-0">⚠</span>
          <span>{mutation.error instanceof Error ? mutation.error.message : 'Error al obtener el video.'}</span>
        </div>
      )}

      {mutation.data && (
        <div className="rounded-xl border border-accent/40 bg-[rgba(22,27,34,0.95)] overflow-hidden">
          {mutation.data.thumbnail_url && (
            <img src={mutation.data.thumbnail_url} alt={mutation.data.title}
              className="w-full max-h-56 object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          )}
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-[#e6edf3] text-base leading-snug">{mutation.data.title || '(sin título)'}</h3>
              <p className="text-muted text-sm mt-1">@{mutation.data.uploader || 'desconocido'}</p>
            </div>
            <button
              onClick={() => onResult(mutation.data!)}
              className="rounded-lg bg-accent/20 text-accent border border-accent/30 px-5 py-2 text-sm font-semibold hover:bg-accent/30 active:scale-95 transition"
            >
              ▶ Reproducir via espejo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

type Tab = 'trending' | 'search' | 'url'

export function TikTokPage() {
  const [tab, setTab] = useState<Tab>('trending')
  const [playing, setPlaying] = useState<TikTokFeedItem | null>(null)
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)

  const handlePlay = (item: TikTokFeedItem) => {
    setPlaying(item)
    setProxyUrl(tiktokStreamUrl(item.stream_url))
  }

  const handleUrlResult = (info: TikTokVideoInfo) => {
    const asFeedItem: TikTokFeedItem = {
      id: info.id,
      title: info.title,
      uploader: info.uploader,
      duration_sec: info.duration_sec,
      thumbnail_url: info.thumbnail_url,
      stream_url: info.stream_url,
    }
    handlePlay(asFeedItem)
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'trending', label: 'Tendencias', icon: '🔥' },
    { id: 'search', label: 'Buscar', icon: '🔍' },
    { id: 'url', label: 'Por URL', icon: '🔗' },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-accent font-bold text-xl tracking-tight">TikTok · Acceso via Espejo</h2>
            <p className="text-muted text-sm max-w-md">
              El servidor espejo actúa de intermediario — tu dispositivo no se conecta a TikTok directamente.
              Diseñado para regiones con restricción geopolítica.
            </p>
          </div>
          <ProxyStatusBadge />
        </div>
      </section>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden border border-[rgba(56,139,253,0.2)] bg-[rgba(13,17,23,0.8)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? 'bg-accent/15 text-accent border-b-2 border-accent'
                : 'text-muted hover:text-[#e6edf3] hover:bg-[rgba(56,139,253,0.05)]'
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'trending' && <TrendingTab onPlay={handlePlay} />}
        {tab === 'search' && <SearchTab onPlay={handlePlay} />}
        {tab === 'url' && <UrlTab onResult={handleUrlResult} />}
      </div>

      {/* Inline video player modal */}
      {playing && proxyUrl && (
        <InlinePlayer
          item={playing}
          proxyUrl={proxyUrl}
          onClose={() => { setPlaying(null); setProxyUrl(null) }}
        />
      )}

    </div>
  )
}
