import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { videoChannelsHealth, videoMeta, videoSearch } from '../api/client'

const CATEGORY_ORDER = [
  'Noticias Cuba',
  'General Cuba',
  'Noticias Internacionales',
  'General Internacional',
]

const CATEGORY_STYLE: Record<string, string> = {
  'Noticias Cuba': 'border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.12)] text-green-300',
  'General Cuba': 'border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.12)] text-blue-300',
  'Noticias Internacionales': 'border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] text-amber-300',
  'General Internacional': 'border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.12)] text-violet-300',
}

function formatTimestamp(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── HLS Player embebido ──────────────────────────────────────────────────────
function HLSPlayer({ src, title, fallbackUrl, fallbackYouTubeUrl }: { src: string; title: string; fallbackUrl?: string; fallbackYouTubeUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!videoRef.current || !src) return
    setError(null)
    setLoading(true)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const video = videoRef.current

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — HLS nativo
      video.src = src
      video.play().catch(() => {})
      setLoading(false)
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, startLevel: -1 })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false)
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setLoading(false)
          setError(data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? 'No se pudo conectar al stream. El canal puede estar fuera del aire.'
            : `Error de reproducción: ${data.details}`)
        }
      })
    } else {
      setError('Tu navegador no soporta HLS. Usa Chrome, Firefox o Safari.')
      setLoading(false)
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [src])

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black z-10">
          <span className="h-10 w-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="text-muted text-sm mt-1">Conectando al canal en vivo…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d1117] p-6 z-10">
          <span className="text-4xl">📡</span>
          <p className="text-muted text-sm text-center max-w-xs">{error}</p>
          <div className="flex gap-2 flex-wrap justify-center mt-1">
            <button
              onClick={() => { setError(null); setLoading(true) }}
              className="px-3 py-1.5 text-xs rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition"
            >
              Reintentar
            </button>
            {fallbackUrl && (
              <a href={fallbackUrl} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(56,139,253,0.4)] text-muted hover:text-accent transition">
                Sitio oficial
              </a>
            )}
            {fallbackYouTubeUrl && (
              <a href={fallbackYouTubeUrl} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(56,139,253,0.4)] text-muted hover:text-accent transition">
                Ver en YouTube
              </a>
            )}
          </div>
        </div>
      )}
      <video ref={videoRef} title={title} controls className="w-full h-full" playsInline />
      {/* Indicador LIVE */}
      {!error && (
        <div className="absolute top-3 left-3 bg-red-600/90 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 pointer-events-none z-10">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          EN VIVO
        </div>
      )}
      {/* Botón PiP */}
      {!error && typeof document !== 'undefined' && document.pictureInPictureEnabled && (
        <button
          title="Picture in Picture"
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            if (document.pictureInPictureElement === v) {
              document.exitPictureInPicture()
            } else {
              v.requestPictureInPicture().catch(() => {})
            }
          }}
          className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-lg border border-white/20 transition flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="7" width="14" height="10" rx="1.5" strokeWidth={2} />
            <rect x="12" y="13" width="9" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
          </svg>
          <span>PiP</span>
        </button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function VideoPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | 'cuba' | 'internacional'>('all')
  const [cubaMode, setCubaMode] = useState(false)
  const [showHealth, setShowHealth] = useState(false)
  const [lastHealthCheck, setLastHealthCheck] = useState<string | null>(null)

  const { data: list, isFetching: listLoading, refetch: refetchList } = useQuery({
    queryKey: ['videoSearch', query],
    queryFn: () => videoSearch(query, 30),
    staleTime: 60_000,
  })

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['videoMeta', selectedId],
    queryFn: () => videoMeta(selectedId!),
    enabled: !!selectedId,
    staleTime: 60_000,
  })

  const healthMutation = useMutation({
    mutationFn: () => videoChannelsHealth(12, 'cuba'),
    onSuccess: () => setLastHealthCheck(new Date().toISOString()),
  })

  // Seleccionar primer canal automáticamente
  useEffect(() => {
    if (!selectedId && list?.results?.length) {
      setSelectedId(list.results[0].id)
    }
  }, [selectedId, list])

  const selectedChannel = useMemo(() => {
    if (!selectedId || !list?.results) return null
    return list.results.find((item) => item.id === selectedId) ?? null
  }, [selectedId, list])

  const groupedChannels = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof list>['results']>()
    for (const item of list?.results ?? []) {
      const category = (item.category || 'General').trim() || 'General'
      const catLower = category.toLowerCase()
      if (scope === 'cuba' && !catLower.includes('cuba')) continue
      if (scope === 'internacional' && !catLower.includes('internacional')) continue
      if (cubaMode && !item.cuba_ready) continue
      const existing = groups.get(category)
      if (existing) existing.push(item)
      else groups.set(category, [item])
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0])
      const bi = CATEGORY_ORDER.indexOf(b[0])
      const aOrder = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER
      const bOrder = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return a[0].localeCompare(b[0])
    })
  }, [list, scope, cubaMode])

  const handleVerTodo = () => {
    setQ(''); setQuery('')
    queryClient.invalidateQueries({ queryKey: ['videoSearch', ''] })
    refetchList()
  }

  // Stream URL para el player (proxy HLS espejo)
  const playerSrc = meta?.has_hls && meta?.hls_proxy_url ? meta.hls_proxy_url : null
  // URL directa del sitio web del canal (NO pasa por el espejo — evita 421 de Cloudflare)
  const webUrl = meta?.web_url || undefined
  const fallbackWebUrl = meta?.fallback_web_url || undefined

  return (
    <div className="space-y-4">

      {/* ── Layout principal: player + lista de canales ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

        {/* ── Player ── */}
        <div className="space-y-3">
          {/* Título del canal activo */}
          {selectedChannel && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3]">{selectedChannel.title}</h2>
                <p className="text-muted text-xs mt-0.5">{selectedChannel.channel} · En vivo</p>
              </div>
              {(webUrl || fallbackWebUrl) && (
                <div className="flex-shrink-0 flex gap-1.5">
                  {webUrl && (
                    <a href={webUrl} target="_blank" rel="noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent transition">
                      ↗ Sitio web
                    </a>
                  )}
                  {fallbackWebUrl && (
                    <a href={fallbackWebUrl} target="_blank" rel="noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent transition">
                      ↗ YouTube
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Player HLS embebido */}
          {metaLoading && selectedId && (
            <div className="aspect-video bg-[#0d1117] rounded-xl flex items-center justify-center border border-[rgba(56,139,253,0.2)]">
              <span className="h-10 w-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          )}

          {!metaLoading && playerSrc && (
            <HLSPlayer
              key={playerSrc}
              src={playerSrc}
              title={selectedChannel?.title ?? ''}
              fallbackUrl={webUrl}
              fallbackYouTubeUrl={fallbackWebUrl}
            />
          )}

          {!metaLoading && meta && !playerSrc && (
            <div className="aspect-video bg-[#0d1117] rounded-xl flex flex-col items-center justify-center gap-4 border border-[rgba(56,139,253,0.2)]">
              <span className="text-5xl">📺</span>
              <div className="text-center">
                <p className="text-[#e6edf3] font-medium">{meta.title}</p>
                <p className="text-muted text-sm mt-1">{meta.description || 'Canal sin stream HLS directo'}</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {webUrl && (
                  <a href={webUrl} target="_blank" rel="noreferrer"
                    className="px-4 py-2 text-sm rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition font-medium">
                    Abrir sitio oficial
                  </a>
                )}
                {fallbackWebUrl && (
                  <a href={fallbackWebUrl} target="_blank" rel="noreferrer"
                    className="px-4 py-2 text-sm rounded-lg border border-[rgba(56,139,253,0.4)] text-muted hover:text-accent transition">
                    Ver en YouTube
                  </a>
                )}
              </div>
            </div>
          )}

          {!selectedId && !listLoading && (
            <div className="aspect-video bg-[#0d1117] rounded-xl flex flex-col items-center justify-center gap-3 border border-[rgba(56,139,253,0.2)]">
              <span className="text-5xl">📺</span>
              <p className="text-muted text-sm">Selecciona un canal de la lista para ver en vivo</p>
            </div>
          )}
        </div>

        {/* ── Lista de canales ── */}
        <div className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] overflow-hidden">
          {/* Filtros */}
          <div className="px-3 py-2.5 border-b border-[rgba(56,139,253,0.15)] space-y-2">
            <form
              onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}
              className="flex gap-1.5"
            >
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar canal…"
                className="flex-1 min-w-0 rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-3 py-1.5 text-[#e6edf3] text-sm placeholder-muted/50 focus:border-accent focus:outline-none"
              />
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-sm hover:bg-accent/30 transition flex-shrink-0">Buscar</button>
              {query && (
                <button type="button" onClick={handleVerTodo} className="px-2 py-1.5 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted text-xs hover:text-accent transition flex-shrink-0">✕</button>
              )}
            </form>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'cuba', 'internacional'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    scope === s ? 'border-accent bg-accent/20 text-accent' : 'border-[rgba(56,139,253,0.25)] text-muted hover:text-accent'
                  }`}
                >
                  {s === 'all' ? 'Todos' : s === 'cuba' ? '🇨🇺 Cuba' : '🌍 Intl'}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCubaMode((v) => !v)}
                className={`ml-auto text-xs px-2.5 py-1 rounded-full border transition ${cubaMode ? 'border-green-400/60 bg-green-500/20 text-green-300' : 'border-[rgba(34,197,94,0.3)] text-muted hover:text-green-300'}`}
              >
                {cubaMode ? 'Cuba ✓' : 'Cuba Mode'}
              </button>
            </div>
          </div>

          {/* Canal list — scrollable */}
          <div className="overflow-y-auto max-h-[60vh] lg:max-h-[calc(100vh-260px)]">
            {listLoading && (
              <div className="p-4 space-y-2 animate-pulse">
                {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-lg bg-[rgba(56,139,253,0.07)]" />)}
              </div>
            )}
            {!listLoading && groupedChannels.map(([category, channels]) => (
              <div key={category}>
                <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-[rgba(56,139,253,0.1)] ${
                  CATEGORY_STYLE[category] || 'text-accent bg-[rgba(22,27,34,0.95)]'
                } bg-[rgba(13,17,23,0.97)]`}>
                  {category}
                </div>
                {channels.map((v) => {
                  const active = selectedId === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-[rgba(56,139,253,0.08)] transition-colors flex items-center gap-2.5 ${
                        active
                          ? 'bg-accent/15 border-l-2 border-l-accent'
                          : 'hover:bg-[rgba(56,139,253,0.07)] border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-[#e6edf3]'}`}>{v.title}</p>
                        <p className="text-muted text-xs truncate">{v.channel}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        {v.cuba_ready && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">Cuba OK</span>
                        )}
                        {active && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 flex items-center gap-0.5">
                            <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
                            Vivo
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
            {!listLoading && groupedChannels.length === 0 && (
              <p className="text-muted text-sm p-4 text-center">Sin canales para este filtro.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Chequeo de canales (colapsable) ── */}
      <div className="rounded-xl border border-[rgba(56,139,253,0.2)] bg-[rgba(22,27,34,0.6)] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHealth(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-sm text-muted hover:text-accent transition"
        >
          <span>Chequeo de disponibilidad de canales {lastHealthCheck && `· último: ${formatTimestamp(lastHealthCheck)}`}</span>
          <span>{showHealth ? '▲' : '▼'}</span>
        </button>
        {showHealth && (
          <div className="px-4 pb-4 border-t border-[rgba(56,139,253,0.15)] pt-3 space-y-3">
            <button
              onClick={() => healthMutation.mutate()}
              disabled={healthMutation.isPending}
              className="px-4 py-2 rounded-lg bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 disabled:opacity-60 transition"
            >
              {healthMutation.isPending ? 'Comprobando...' : 'Comprobar ahora'}
            </button>
            {healthMutation.data && (
              <div className="space-y-2">
                <p className="text-muted text-xs">
                  {healthMutation.data.reachable}/{healthMutation.data.total} accesibles
                  {healthMutation.data.unavailable > 0 && <span className="text-red-400 ml-1">· {healthMutation.data.unavailable} no disponibles</span>}
                </p>
                {healthMutation.data.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[rgba(56,139,253,0.15)] p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#e6edf3]">{item.title}</span>
                      <span className={`px-1.5 py-0.5 rounded-full ${item.reachable ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                        {item.reachable ? `OK ${item.latency_ms}ms` : 'Fallo'}
                      </span>
                    </div>
                    {item.error && <p className="text-red-400/70 mt-1 truncate">{item.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
