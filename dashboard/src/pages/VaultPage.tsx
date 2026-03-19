import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  VaultItem, VaultChannel, VaultCategory,
  getVaultCatalog, vaultStreamUrl, formatDuration, formatSize,
} from '../api/vaultApi'
import { useVaultPlayer } from '../contexts/VaultPlayerContext'

// ─── Iconos ───────────────────────────────────────────────────────────────────
const Icon = {
  Film: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
      <rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/><line x1="17" y1="7" x2="22" y2="7"/>
      <line x1="17" y1="17" x2="22" y2="17"/><line x1="2" y1="17" x2="7" y2="17"/>
    </svg>
  ),
  Music: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  Video: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  ),
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  Pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  ),
  Shuffle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
      <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
      <line x1="4" y1="4" x2="9" y2="9"/>
    </svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  WifiOff: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a11 11 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  SortAZ: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="12" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
      <polyline points="17 4 21 8 17 12"/><line x1="21" y1="8" x2="13" y2="8"/>
    </svg>
  ),
  Fullscreen: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  List: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  Grid: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
}

// ─── Constantes ────────────────────────────────────────────────────────────────
const CHANNEL_LABELS: Record<VaultChannel, { label: string; desc: string; color: string }> = {
  cami:    { label: 'Canal CAMI',    desc: 'Música cristiana · Cine cristiano', color: '#a78bfa' },
  variado: { label: 'Canal Variado', desc: 'Entretenimiento general',           color: '#38bdf8' },
}

const CATEGORY_TABS: { id: VaultCategory | 'all'; label: string; icon: keyof typeof Icon }[] = [
  { id: 'all',        label: 'Todo',       icon: 'Search' },
  { id: 'pelicula',   label: 'Películas',  icon: 'Film'   },
  { id: 'musica',     label: 'Música',     icon: 'Music'  },
  { id: 'musicvideo', label: 'Videoclips', icon: 'Video'  },
]

const FORMAT_BADGE: Record<string, { bg: string; text: string }> = {
  mp4:  { bg: '#0c2a1a', text: '#4ade80' },
  mp3:  { bg: '#0c1a2a', text: '#60a5fa' },
  webm: { bg: '#2a1a0c', text: '#fb923c' },
  mkv:  { bg: '#1a0c2a', text: '#c084fc' },
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function VaultPage() {
  const [channel, setChannel]       = useState<VaultChannel>('cami')
  const [category, setCategory]     = useState<VaultCategory | 'all'>('all')
  const [query, setQuery]           = useState('')
  const [items, setItems]           = useState<VaultItem[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [videoItem, setVideoItem]   = useState<VaultItem | null>(null)
  const [sortMode, setSortMode]     = useState<'default' | 'az'>('default')
  const [listView, setListView]     = useState(() => window.innerWidth < 400)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const vaultPlayer = useVaultPlayer()
  const ch = CHANNEL_LABELS[channel]

  // Contar por categoría para mostrar en tabs
  const countByCategory = useCallback((cat: VaultCategory | 'all') => {
    if (cat === 'all') return items.length
    return items.filter(i => i.category === cat).length
  }, [items])

  const loadCatalog = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await getVaultCatalog({
        channel,
        category: category === 'all' ? undefined : category,
        q: query || undefined,
      })
      const fetched = res.items ?? []
      setItems(fetched)
      vaultPlayer.updateCatalog(fetched)
    } catch {
      setError('No se pudo cargar el Vault. Verifica la conexión con el espejo.')
      setItems([])
    } finally { setLoading(false) }
  }, [channel, category, query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCatalog() }, [loadCatalog])

  // Detectar ancho para cambiar automáticamente a vista lista en móvil muy pequeño
  useEffect(() => {
    const handler = () => setListView(window.innerWidth < 400)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const handleItemClick = (item: VaultItem) => {
    if (item.category === 'musica') {
      vaultPlayer.play(item, items)
      setVideoItem(null)
    } else {
      setVideoItem(item)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const closeVideo = () => { videoRef.current?.pause(); setVideoItem(null) }

  const requestFullscreen = () => {
    const vid = videoRef.current
    if (!vid) return
    if (vid.requestFullscreen) vid.requestFullscreen()
    else if ((vid as any).webkitRequestFullscreen) (vid as any).webkitRequestFullscreen()
    else if ((vid as any).webkitEnterFullscreen) (vid as any).webkitEnterFullscreen() // iOS Safari
  }

  const handlePlayRandom = () => {
    const musicItems = items.filter(i => i.category === 'musica')
    if (musicItems.length > 0) {
      vaultPlayer.playRandomFrom(items)
      setVideoItem(null)
      return
    }
    const videoItems = items.filter(i => i.category !== 'musica')
    if (videoItems.length === 0) return
    setVideoItem(videoItems[Math.floor(Math.random() * videoItems.length)])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Ordenar items según sortMode
  const sortedItems = sortMode === 'az'
    ? [...items].sort((a, b) => a.title.localeCompare(b.title, 'es'))
    : items

  const musicCount = items.filter(i => i.category === 'musica').length
  const isPlayingMusic = !!vaultPlayer.currentItem

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1a1d2e 0%, #0f1117 100%)', borderBottom: '1px solid #1e2435', padding: '16px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22 }}>🎬</span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>RAULI Bóveda</h1>
            <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#94a3b8' }}>
              Contenido local
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Películas, música y videoclips curados — la música sigue aunque cambies de módulo
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Now Playing banner ────────────────────────────────────────────── */}
        {isPlayingMusic && (
          <NowPlayingBanner
            item={vaultPlayer.currentItem!}
            isPlaying={vaultPlayer.isPlaying}
            progress={vaultPlayer.progress}
            duration={vaultPlayer.duration}
            onToggle={vaultPlayer.togglePlay}
            onNext={vaultPlayer.next}
            onPrev={vaultPlayer.prev}
            onSeek={vaultPlayer.seek}
            onStop={vaultPlayer.stop}
            channelColor={ch.color}
          />
        )}

        {/* ── Selector de canal ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {(Object.keys(CHANNEL_LABELS) as VaultChannel[]).map(c => {
            const info = CHANNEL_LABELS[c]
            const active = channel === c
            return (
              <button key={c} onClick={() => { setChannel(c); setCategory('all') }}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: active ? `${info.color}18` : '#1a1d2e', outline: active ? `2px solid ${info.color}` : '2px solid transparent', transition: 'all 0.2s', textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: active ? info.color : '#94a3b8' }}>
                  {c === 'cami' ? '✝ ' : '★ '}{info.label}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{info.desc}</div>
              </button>
            )
          })}
        </div>

        {/* ── Player de video inline ───────────────────────────────────────── */}
        {videoItem && (
          <div style={{ background: '#0d1117', borderRadius: 14, border: '1px solid #1e2435', marginBottom: 20, overflow: 'hidden' }}>
            {/* Header con botón cerrar grande */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e2435' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {videoItem.title}
                </div>
                {videoItem.artist && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{videoItem.artist}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                {/* Pantalla completa */}
                <button onClick={requestFullscreen}
                  title="Pantalla completa"
                  style={{ background: '#1a1d2e', border: '1px solid #2a3448', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Icon.Fullscreen />
                  <span style={{ display: window.innerWidth < 400 ? 'none' : 'inline' }}>Pantalla completa</span>
                </button>
                {/* Cerrar — grande y obvio */}
                <button onClick={closeVideo}
                  title="Cerrar video"
                  style={{ background: '#1a0f0f', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <Icon.X />
                  <span style={{ display: window.innerWidth < 400 ? 'none' : 'inline' }}>Cerrar</span>
                </button>
              </div>
            </div>
            <video
              ref={videoRef}
              src={vaultStreamUrl(videoItem.id)}
              controls
              autoPlay
              playsInline
              style={{ width: '100%', maxHeight: 420, background: '#000', display: 'block' }}
            />
          </div>
        )}

        {/* ── Tabs + controles ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Tabs con conteo */}
          <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
            {CATEGORY_TABS.map(tab => {
              const active = category === tab.id
              const TabIcon = Icon[tab.icon]
              const count = countByCategory(tab.id)
              return (
                <button key={tab.id} onClick={() => setCategory(tab.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? ch.color : '#1a1d2e', color: active ? '#0f1117' : '#64748b', fontWeight: active ? 600 : 400, fontSize: 13, whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0 }}>
                  <TabIcon />
                  {tab.label}
                  {items.length > 0 && (
                    <span style={{ background: active ? 'rgba(0,0,0,0.2)' : '#0f1117', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Controles: aleatorio, ordenar, vista */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {/* Orden A-Z */}
            <button onClick={() => setSortMode(m => m === 'az' ? 'default' : 'az')}
              title={sortMode === 'az' ? 'Orden: A-Z (click para volver)' : 'Ordenar A-Z'}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 8, border: `1px solid ${sortMode === 'az' ? ch.color : '#2a3448'}`, cursor: 'pointer', background: sortMode === 'az' ? `${ch.color}18` : 'none', color: sortMode === 'az' ? ch.color : '#64748b', fontSize: 12, transition: 'all 0.15s' }}>
              <Icon.SortAZ />
            </button>
            {/* Vista lista/grid */}
            <button onClick={() => setListView(v => !v)}
              title={listView ? 'Ver en cuadrícula' : 'Ver en lista'}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 8, border: '1px solid #2a3448', cursor: 'pointer', background: 'none', color: '#64748b', fontSize: 12, transition: 'all 0.15s' }}>
              {listView ? <Icon.Grid /> : <Icon.List />}
            </button>
            {/* Aleatorio */}
            {items.length > 0 && (
              <button onClick={handlePlayRandom}
                title={musicCount > 0 ? `Reproducir música aleatoria (${musicCount} pistas)` : 'Reproducir video aleatorio'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${ch.color}55`, cursor: 'pointer', background: `${ch.color}15`, color: ch.color, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                <Icon.Shuffle />
                <span style={{ display: window.innerWidth < 380 ? 'none' : 'inline' }}>Aleatorio</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Búsqueda ─────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}><Icon.Search /></div>
          <input type="text" placeholder="Buscar título, artista, género..." value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10, background: '#1a1d2e', border: '1px solid #1e2435', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          {query && (
            <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}><Icon.X /></button>
          )}
        </div>

        {/* ── Estados ──────────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #1e2435', borderTop: `3px solid ${ch.color}`, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
            <div>Cargando catálogo...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{ background: '#1a0f0f', border: '1px solid #7f1d1d', borderRadius: 10, padding: '14px 16px', color: '#fca5a5', fontSize: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon.WifiOff />{error}
            </div>
            <button onClick={loadCatalog}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444', background: '#3f0f0f', color: '#fca5a5', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Icon.Refresh />Reintentar
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState channel={channel} category={category} query={query} onRetry={loadCatalog} />
        )}

        {!loading && items.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
              {items.length} {items.length === 1 ? 'resultado' : 'resultados'}
              {query && ` para "${query}"`}
              {musicCount > 0 && !query && <span style={{ marginLeft: 8, color: ch.color }}>· {musicCount} pistas de música</span>}
            </div>
            <ItemGrid
              items={sortedItems}
              onPlay={handleItemClick}
              activeMusicId={vaultPlayer.currentItem?.id}
              activeVideoId={videoItem?.id}
              channelColor={ch.color}
              listView={listView}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Banner Now Playing ────────────────────────────────────────────────────────
function NowPlayingBanner({ item, isPlaying, progress, duration, onToggle, onNext, onPrev, onSeek, onStop, channelColor }: {
  item: VaultItem
  isPlaying: boolean
  progress: number
  duration: number
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (f: number) => void
  onStop: () => void
  channelColor: string
}) {
  const elapsed = duration > 0 ? Math.floor(duration * progress) : 0
  const total   = Math.floor(duration)
  const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSeek((e.clientX - rect.left) / rect.width)
  }

  return (
    <div style={{ background: `linear-gradient(135deg, ${channelColor}14, #1a1d2e)`, border: `1px solid ${channelColor}44`, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
      {/* Título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {/* Animación ecualizador */}
        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          {[1.2, 0.9, 1.1].map((_, i) => (
            <div key={i} style={{ width: 5, background: channelColor, borderRadius: 2, height: isPlaying ? '100%' : '30%', transition: 'height 0.3s', animationName: isPlaying ? 'eq' : 'none' }} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: channelColor, fontWeight: 700, marginBottom: 2 }}>Reproduciendo ahora</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
          {item.artist && <div style={{ fontSize: 11, color: '#64748b' }}>{item.artist}</div>}
        </div>
      </div>

      {/* Barra de progreso */}
      <div onClick={handleBarClick}
        style={{ height: 6, background: '#1e2435', borderRadius: 3, cursor: 'pointer', marginBottom: 6, position: 'relative', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: channelColor, borderRadius: 3, transition: 'width 0.4s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginBottom: 10 }}>
        <span>{fmt(elapsed)}</span>
        {duration > 0 && <span>-{fmt(total - elapsed)}</span>}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {/* Anterior */}
        <button onClick={onPrev} title="Anterior"
          style={{ background: 'none', border: '1px solid #2a3448', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth={2} fill="none"/>
            <polygon points="19 4 9 12 19 20 19 4"/>
          </svg>
        </button>
        {/* Play/Pause */}
        <button onClick={onToggle} title={isPlaying ? 'Pausar' : 'Continuar'}
          style={{ background: channelColor, border: 'none', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0f1117', boxShadow: `0 0 16px ${channelColor}55` }}>
          {isPlaying
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </button>
        {/* Siguiente */}
        <button onClick={onNext} title="Siguiente"
          style={{ background: 'none', border: '1px solid #2a3448', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <polygon points="5 4 15 12 5 20 5 4"/>
            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth={2} fill="none"/>
          </svg>
        </button>
        {/* Detener */}
        <button onClick={onStop} title="Detener"
          style={{ background: 'none', border: '1px solid #3f1515', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444', marginLeft: 8 }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Grid / Lista ─────────────────────────────────────────────────────────────
function ItemGrid({ items, onPlay, activeMusicId, activeVideoId, channelColor, listView }: {
  items: VaultItem[]
  onPlay: (item: VaultItem) => void
  activeMusicId?: string
  activeVideoId?: string
  channelColor: string
  listView: boolean
}) {
  if (listView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <ItemRow key={item.id} item={item} onPlay={onPlay}
            isActiveMusic={activeMusicId === item.id} isActiveVideo={activeVideoId === item.id} channelColor={channelColor} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {items.map(item => (
        <ItemCard key={item.id} item={item} onPlay={onPlay}
          isActiveMusic={activeMusicId === item.id} isActiveVideo={activeVideoId === item.id} channelColor={channelColor} />
      ))}
    </div>
  )
}

// ─── Tarjeta (grid) ───────────────────────────────────────────────────────────
function ItemCard({ item, onPlay, isActiveMusic, isActiveVideo }: {
  item: VaultItem; onPlay: (item: VaultItem) => void
  isActiveMusic: boolean; isActiveVideo: boolean; channelColor: string
}) {
  const [hover, setHover] = useState(false)
  const isActive = isActiveMusic || isActiveVideo
  const catEmoji = ({ pelicula: '🎬', musica: '🎵', musicvideo: '🎥' } as Record<string, string>)[item.category] ?? '📁'
  const chColor = CHANNEL_LABELS[item.channel].color
  const ext = item.filename?.split('.').pop()?.toLowerCase() ?? ''
  const badge = FORMAT_BADGE[ext]

  return (
    <div onClick={() => onPlay(item)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: isActive ? `${chColor}18` : (hover ? '#1e2435' : '#161922'), border: `1px solid ${isActive ? chColor : (hover ? '#2a3448' : '#1e2435')}`, borderRadius: 12, cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s', transform: hover && !isActive ? 'translateY(-2px)' : 'none', position: 'relative' }}>

      {isActiveMusic && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${chColor}, ${chColor}88)`, zIndex: 1 }} />
      )}

      {/* Thumbnail */}
      <div style={{ height: 120, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {item.thumbnail
          ? <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 38 }}>{catEmoji}</span>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover || isActive ? 1 : 0, transition: 'opacity 0.15s' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: chColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1117' }}>
            {isActiveMusic ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <rect x="3" y="10" width="3" height="10" rx="1.5">
                  <animate attributeName="height" values="10;18;6;14;10" dur="1.2s" repeatCount="indefinite"/>
                  <animate attributeName="y" values="10;6;14;8;10" dur="1.2s" repeatCount="indefinite"/>
                </rect>
                <rect x="9" y="6" width="3" height="14" rx="1.5">
                  <animate attributeName="height" values="14;8;18;6;14" dur="0.9s" repeatCount="indefinite"/>
                  <animate attributeName="y" values="6;10;4;12;6" dur="0.9s" repeatCount="indefinite"/>
                </rect>
                <rect x="15" y="8" width="3" height="12" rx="1.5">
                  <animate attributeName="height" values="12;16;8;18;12" dur="1.1s" repeatCount="indefinite"/>
                  <animate attributeName="y" values="8;6;12;4;8" dur="1.1s" repeatCount="indefinite"/>
                </rect>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </div>
        </div>
        {/* Badge formato */}
        {badge && (
          <div style={{ position: 'absolute', bottom: 6, left: 6, background: badge.bg, border: `1px solid ${badge.text}44`, borderRadius: 4, padding: '1px 5px', fontSize: 9, color: badge.text, fontWeight: 700, letterSpacing: 0.5 }}>
            .{ext.toUpperCase()}
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, right: 6, background: `${chColor}22`, border: `1px solid ${chColor}44`, borderRadius: 6, padding: '2px 6px', fontSize: 10, color: chColor }}>
          {item.channel === 'cami' ? '✝' : '★'}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: isActiveMusic ? chColor : '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
          {item.title}
        </div>
        {item.artist && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.artist}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.genre && <span style={{ background: '#1e2435', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: '#64748b' }}>{item.genre}</span>}
          {item.duration_secs ? <span style={{ fontSize: 10, color: '#475569' }}>{formatDuration(item.duration_secs)}</span> : null}
          {item.file_size_bytes ? <span style={{ fontSize: 10, color: '#334155' }}>{formatSize(item.file_size_bytes)}</span> : null}
        </div>
        {item.plays > 0 && <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>▶ {item.plays}</div>}
      </div>
    </div>
  )
}

// ─── Fila (vista lista) ───────────────────────────────────────────────────────
function ItemRow({ item, onPlay, isActiveMusic, isActiveVideo }: {
  item: VaultItem; onPlay: (item: VaultItem) => void
  isActiveMusic: boolean; isActiveVideo: boolean; channelColor: string
}) {
  const [hover, setHover] = useState(false)
  const isActive = isActiveMusic || isActiveVideo
  const catEmoji = ({ pelicula: '🎬', musica: '🎵', musicvideo: '🎥' } as Record<string, string>)[item.category] ?? '📁'
  const chColor = CHANNEL_LABELS[item.channel].color
  const ext = item.filename?.split('.').pop()?.toLowerCase() ?? ''
  const badge = FORMAT_BADGE[ext]

  return (
    <div onClick={() => onPlay(item)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: isActive ? `${chColor}12` : (hover ? '#1e2435' : '#161922'), border: `1px solid ${isActive ? chColor : (hover ? '#2a3448' : '#1e2435')}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}>

      {isActiveMusic && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: chColor }} />
      )}

      {/* Thumbnail pequeño */}
      <div style={{ width: 48, height: 48, borderRadius: 8, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {item.thumbnail
          ? <img src={item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 22 }}>{catEmoji}</span>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: isActiveMusic ? chColor : '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.artist && <span style={{ fontSize: 11, color: '#64748b' }}>{item.artist}</span>}
          {item.duration_secs ? <span style={{ fontSize: 10, color: '#475569' }}>{formatDuration(item.duration_secs)}</span> : null}
          {badge && <span style={{ background: badge.bg, border: `1px solid ${badge.text}44`, borderRadius: 3, padding: '0px 4px', fontSize: 9, color: badge.text, fontWeight: 700 }}>.{ext.toUpperCase()}</span>}
        </div>
      </div>

      {/* Icono play */}
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: isActive ? chColor : '#1a1d2e', border: `1px solid ${isActive ? chColor : '#2a3448'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#0f1117' : '#64748b', flexShrink: 0 }}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
    </div>
  )
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────
function EmptyState({ channel, category, query, onRetry }: {
  channel: VaultChannel; category: VaultCategory | 'all'; query: string; onRetry: () => void
}) {
  const isFiltered = category !== 'all' || query
  const catLabel = ({ pelicula: 'películas', musica: 'música', musicvideo: 'videoclips', all: 'contenido' } as Record<string, string>)[category]
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{isFiltered ? '🔍' : '📭'}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color: '#94a3b8', marginBottom: 8 }}>{isFiltered ? 'Sin resultados' : 'Aún no hay contenido aquí'}</div>
      <div style={{ fontSize: 13, color: '#475569', maxWidth: 320, margin: '0 auto 20px', lineHeight: 1.6 }}>
        {isFiltered
          ? `No encontramos ${catLabel} con esos filtros.`
          : `El ${CHANNEL_LABELS[channel].label} está preparado. Ejecuta seed_vault.bat para cargar contenido.`
        }
      </div>
      <button onClick={onRetry}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: '1px solid #2a3448', background: '#161922', color: '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        <Icon.Refresh />Recargar catálogo
      </button>
      {!isFiltered && (
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(['pelicula', 'musica', 'musicvideo'] as VaultCategory[]).map(cat => (
            <div key={cat} style={{ background: '#161922', border: '1px solid #1e2435', borderRadius: 10, padding: '10px 16px', fontSize: 12, color: '#475569', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>
                {({ pelicula: '🎬', musica: '🎵', musicvideo: '🎥' } as Record<string, string>)[cat]}
              </div>
              {({ pelicula: 'Películas', musica: 'Música', musicvideo: 'Videoclips' } as Record<string, string>)[cat]}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
