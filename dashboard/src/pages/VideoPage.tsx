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

function Skeleton() {
  return (
    <div className="animate-pulse grid gap-3 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 rounded-lg bg-[rgba(48,54,61,0.4)]" />
      ))}
    </div>
  )
}

function formatTimestamp(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── HLS Player embebido ──────────────────────────────────────────────────────
function HLSPlayer({ src, title }: { src: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!videoRef.current || !src) return
    setError(null)
    setLoading(true)

    // Destruir instancia previa
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const video = videoRef.current

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — soporte HLS nativo
      video.src = src
      video.play().catch(() => {/* autoplay puede bloquearse */})
      setLoading(false)
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // auto quality
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false)
        video.play().catch(() => {/* autoplay puede bloquearse */})
      })
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setLoading(false)
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setError('No se pudo conectar al stream. El canal puede estar fuera del aire o restringido desde esta región.')
          } else {
            setError(`Error de reproducción: ${data.details}`)
          }
        }
      })
    } else {
      setError('Tu navegador no soporta HLS. Usa Chrome, Firefox o Safari.')
      setLoading(false)
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [src])

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-[rgba(56,139,253,0.3)]">
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 z-10">
          <span className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="text-muted text-xs">Conectando al stream en vivo…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 z-10">
          <span className="text-3xl">📡</span>
          <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true) }}
            className="mt-1 px-3 py-1.5 text-xs rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition"
          >
            Reintentar
          </button>
        </div>
      )}
      <video
        ref={videoRef}
        title={title}
        controls
        className="w-full h-full"
        playsInline
      />
      {/* Indicador LIVE */}
      <div className="absolute top-2 left-2 bg-red-600/90 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 pointer-events-none">
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
        EN VIVO
      </div>
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
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastHealthCheck, setLastHealthCheck] = useState<string | null>(null)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: list, isFetching: listLoading, refetch: refetchList } = useQuery({
    queryKey: ['videoSearch', query],
    queryFn: () => videoSearch(query, 30),
    staleTime: 60_000,
  })

  const { data: meta } = useQuery({
    queryKey: ['videoMeta', selectedId],
    queryFn: () => videoMeta(selectedId!),
    enabled: !!selectedId,
    staleTime: 60_000,
  })

  const healthMutation = useMutation({
    mutationFn: () => videoChannelsHealth(12, 'cuba'),
    onSuccess: () => {
      setLastHealthCheck(new Date().toISOString())
    },
  })

  // Auto-refresh: poll health every 60s cuando está activado
  useEffect(() => {
    if (autoRefresh) {
      healthMutation.mutate()
      autoRefreshRef.current = setInterval(() => {
        healthMutation.mutate()
      }, 60_000)
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
        autoRefreshRef.current = null
      }
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
        autoRefreshRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh])

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
      const isCuba = catLower.includes('cuba')
      const isInternacional = catLower.includes('internacional')
      if (scope === 'cuba' && !isCuba) continue
      if (scope === 'internacional' && !isInternacional) continue
      if (cubaMode && !item.cuba_ready) continue
      const existing = groups.get(category)
      if (existing) {
        existing.push(item)
      } else {
        groups.set(category, [item])
      }
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
    setQ('')
    setQuery('')
    queryClient.invalidateQueries({ queryKey: ['videoSearch', ''] })
    refetchList()
  }

  return (
    <div className="space-y-6">
      {/* ── Player embebido — aparece cuando el canal tiene HLS ── */}
      {selectedId && meta?.has_hls && meta?.hls_proxy_url && (
        <section className="rounded-xl overflow-hidden border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)]">
          <div className="px-4 py-2 border-b border-[rgba(56,139,253,0.2)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#e6edf3] truncate">{meta.title}</span>
              <span className="text-muted text-xs">· {meta.channel}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href={meta.cuba_url || `/api/video/${encodeURIComponent(selectedId)}/stream?mode=cuba`}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 rounded border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent transition"
                title="Abrir en nueva pestaña"
              >
                ↗ Nueva pestaña
              </a>
            </div>
          </div>
          <HLSPlayer
            key={meta.hls_proxy_url}
            src={meta.hls_proxy_url}
            title={meta.title}
          />
          <p className="px-4 py-2 text-xs text-muted/60">
            Stream en vivo via proxy espejo · Si no carga, el canal puede estar fuera del aire
          </p>
        </section>
      )}

      {/* ── Sin HLS: mostrar botones de enlace ── */}
      {selectedId && meta && !meta.has_hls && (
        <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5">
          <h3 className="text-accent font-semibold mb-1">{meta.title}</h3>
          <p className="text-muted text-sm mb-3">
            {meta.description || selectedChannel?.description || 'Canal de TV en vivo'} · Este canal no tiene stream HLS disponible. Se abrirá en el sitio web oficial.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={meta.cuba_url || `/api/video/${encodeURIComponent(selectedId)}/stream?mode=cuba`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-accent/20 text-accent px-4 py-2 font-medium hover:bg-accent/30 transition"
            >
              Abrir canal (modo Cuba)
            </a>
            <a
              href={meta.watch_url || `/api/video/${encodeURIComponent(selectedId)}/stream`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[rgba(56,139,253,0.4)] px-4 py-2 text-sm text-muted hover:text-accent hover:border-accent/50"
            >
              Abrir canal (directo)
            </a>
          </div>
        </section>
      )}

      {/* ── Búsqueda y filtros ── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <h2 className="text-accent font-semibold mb-1">TV en vivo · Canales en español</h2>
        <p className="text-muted text-xs mb-4">
          Los canales marcados <span className="text-green-300">con stream HLS</span> se reproducen directamente en la app.
          Los demás abren el sitio web oficial.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(q.trim())
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar canal (ej: RTVE, DW, Caribe, France 24)..."
            className="flex-1 min-w-[220px] rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-accent/20 text-accent px-4 py-2.5 font-medium hover:bg-accent/30 transition">
            Buscar
          </button>
          <button
            type="button"
            className="rounded-lg border border-[rgba(56,139,253,0.4)] px-4 py-2.5 text-sm text-muted hover:text-accent hover:border-accent/50"
            onClick={handleVerTodo}
          >
            Ver todo
          </button>
        </form>
      </section>

      {/* ── Lista de canales ── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              scope === 'all'
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-[rgba(56,139,253,0.35)] bg-[rgba(56,139,253,0.08)] text-muted hover:text-accent hover:border-accent/50'
            }`}
          >
            Todo
          </button>
          <button
            type="button"
            onClick={() => setScope('cuba')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              scope === 'cuba'
                ? 'border-green-400/60 bg-green-500/20 text-green-300'
                : 'border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] text-muted hover:text-green-300 hover:border-green-400/60'
            }`}
          >
            Solo Cuba
          </button>
          <button
            type="button"
            onClick={() => setScope('internacional')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              scope === 'internacional'
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                : 'border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] text-muted hover:text-amber-300 hover:border-amber-400/60'
            }`}
          >
            Solo Internacional
          </button>
          <button
            type="button"
            onClick={() => setCubaMode((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ml-auto ${
              cubaMode
                ? 'border-green-400/60 bg-green-500/20 text-green-300'
                : 'border-[rgba(34,197,94,0.3)] text-muted hover:text-green-300 hover:border-green-400/40'
            }`}
            title="Mostrar solo canales listos para Cuba"
          >
            {cubaMode ? 'Cuba Mode: ON' : 'Cuba Mode'}
          </button>
        </div>
        {listLoading && <Skeleton />}
        {list && (
          <div className="space-y-4">
            {groupedChannels.map(([category, channels]) => (
              <div key={category}>
                <div
                  className={`mb-2 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                    CATEGORY_STYLE[category] || 'border-[rgba(56,139,253,0.35)] bg-[rgba(56,139,253,0.12)] text-accent'
                  }`}
                >
                  {category} ({channels.length})
                </div>
                <ul className="space-y-2">
                  {channels.map((v) => (
                    <li
                      key={v.id}
                      className={`rounded-lg border p-3 cursor-pointer transition ${selectedId === v.id ? 'border-accent bg-accent/10' : 'border-[rgba(56,139,253,0.2)] hover:border-accent/50'}`}
                      onClick={() => setSelectedId(v.id)}
                    >
                      <span className="font-medium block truncate">{v.title}</span>
                      <span className="text-muted text-sm">{v.channel} · En vivo</span>
                      <div className="mt-1.5 flex items-center gap-2 text-xs flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 ${v.cuba_ready ? 'bg-green-500/15 text-green-300' : 'bg-yellow-500/15 text-yellow-300'}`}>
                          {v.cuba_ready ? 'Cuba OK' : 'Verificar ruta'}
                        </span>
                        {selectedId === v.id && meta?.has_hls && (
                          <span className="rounded-full px-2 py-0.5 bg-blue-500/15 text-blue-300">
                            ▶ Stream HLS
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {!listLoading && list && list.results.length === 0 && (
          <p className="text-sm text-muted">No hay canales para ese filtro. Pruebe con "Ver todo".</p>
        )}
        {!listLoading && list && list.results.length > 0 && groupedChannels.length === 0 && (
          <p className="text-sm text-muted">
            No hay canales en este alcance. {cubaMode && 'Desactive Cuba Mode o '}Cambie a <strong>Todo</strong>.
          </p>
        )}
      </section>

      {/* ── Chequeo de canales ── */}
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-accent font-semibold">Chequeo de canales</h3>
            <p className="text-muted text-sm">Verifica disponibilidad desde el servidor.</p>
            {lastHealthCheck && (
              <p className="text-xs text-muted mt-1">Ultimo chequeo: {formatTimestamp(lastHealthCheck)}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                autoRefresh
                  ? 'border-green-400/50 bg-green-500/15 text-green-300 hover:bg-green-500/25'
                  : 'border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50'
              }`}
            >
              {autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh'}
            </button>
            <button
              onClick={() => healthMutation.mutate()}
              disabled={healthMutation.isPending}
              className="rounded-lg bg-accent/20 text-accent px-4 py-2 font-medium hover:bg-accent/30 disabled:opacity-60"
            >
              {healthMutation.isPending ? 'Comprobando...' : 'Comprobar ahora'}
            </button>
          </div>
        </div>

        {healthMutation.data && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">
              Resultado: {healthMutation.data.reachable}/{healthMutation.data.total} accesibles ({healthMutation.data.mode})
              {healthMutation.data.unavailable > 0 && (
                <span className="text-red-400 ml-2">{healthMutation.data.unavailable} no disponibles</span>
              )}
            </p>
            <div className="space-y-2">
              {healthMutation.data.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-[rgba(56,139,253,0.2)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      {item.cuba_ready && (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-green-500/15 text-green-300">Cuba OK</span>
                      )}
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${item.reachable ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                      {item.reachable ? `OK (${item.status_code})` : `Fallo (${item.status_code || 'sin codigo'})`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted break-all">{item.url}</p>
                  <p className="mt-1 text-xs text-muted">Latencia: {item.latency_ms} ms {item.error ? `· ${item.error}` : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
