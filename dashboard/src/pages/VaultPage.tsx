import { useState, useEffect, useRef, useCallback } from 'react'
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

// ─── Página principal ─────────────────────────────────────────────────────────
export default function VaultPage() {
  const [channel, setChannel]     = useState<VaultChannel>('cami')
  const [category, setCategory]   = useState<VaultCategory | 'all'>('all')
  const [query, setQuery]         = useState('')
  const [items, setItems]         = useState<VaultItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [videoItem, setVideoItem] = useState<VaultItem | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const vaultPlayer = useVaultPlayer()
  const ch = CHANNEL_LABELS[channel]

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

  const musicCount = items.filter(i => i.category === 'musica').length

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1a1d2e 0%, #0f1117 100%)', borderBottom: '1px solid #1e2435', padding: '16px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22 }}>🎬</span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>RAULI Bóveda</h1>
            <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#94a3b8' }}>📦 Contenido local</span>
            {vaultPlayer.currentItem && (
              <span style={{ background: `${ch.color}18`, border: `1px solid ${ch.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, color: ch.color }}>
                🎵 Reproduciendo en segundo plano
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Películas, música y videoclips curados — la música sigue aunque cambies de módulo
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Selector de canal ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {(Object.keys(CHANNEL_LABELS) as VaultChannel[]).map(c => {
            const info = CHANNEL_LABELS[c]
            const active = channel === c
            return (
              <button key={c} onClick={() => { setChannel(c); setCategory('all') }}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: active ? `${info.color}18` : '#1a1d2e', outline: active ? `2px solid ${info.color}` : '2px solid transparent', transition: 'all 0.2s', textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: active ? info.color : '#94a3b8' }}>
                  {c === 'cami' ? '✝️ ' : '🎭 '}{info.label}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{info.desc}</div>
              </button>
            )
          })}
        </div>

        {/* ── Player de video inline ───────────────────────────────────────── */}
        {videoItem && (
          <div style={{ background: '#0d1117', borderRadius: 14, border: '1px solid #1e2435', marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e2435' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>{videoItem.title}</div>
                {videoItem.artist && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{videoItem.artist}</div>}
              </div>
              <button onClick={closeVideo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}><Icon.X /></button>
            </div>
            <video ref={videoRef} src={vaultStreamUrl(videoItem.id)} controls autoPlay
              style={{ width: '100%', maxHeight: 420, background: '#000', display: 'block' }} />
          </div>
        )}

        {/* ── Tabs + Botón Aleatorio ───────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
            {CATEGORY_TABS.map(tab => {
              const active = category === tab.id
              const TabIcon = Icon[tab.icon]
              return (
                <button key={tab.id} onClick={() => setCategory(tab.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? ch.color : '#1a1d2e', color: active ? '#0f1117' : '#64748b', fontWeight: active ? 600 : 400, fontSize: 13, whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0 }}>
                  <TabIcon />{tab.label}
                </button>
              )
            })}
          </div>
          {items.length > 0 && (
            <button onClick={handlePlayRandom}
              title={musicCount > 0 ? `Reproducir música aleatoria (${musicCount} pistas)` : 'Reproducir video aleatorio'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: `1px solid ${ch.color}55`, cursor: 'pointer', background: `${ch.color}15`, color: ch.color, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0 }}>
              <Icon.Shuffle />Aleatorio
            </button>
          )}
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
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            <div>Cargando catálogo...</div>
          </div>
        )}
        {error && (
          <div style={{ background: '#1a0f0f', border: '1px solid #7f1d1d', borderRadius: 10, padding: '14px 16px', color: '#fca5a5', fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.WifiOff />{error}
          </div>
        )}
        {!loading && !error && items.length === 0 && <EmptyState channel={channel} category={category} query={query} />}

        {!loading && items.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
              {items.length} {items.length === 1 ? 'resultado' : 'resultados'}
              {query && ` para "${query}"`}
              {musicCount > 0 && !query && <span style={{ marginLeft: 8, color: ch.color }}>· {musicCount} pistas de música</span>}
            </div>
            <ItemGrid items={items} onPlay={handleItemClick} activeMusicId={vaultPlayer.currentItem?.id} activeVideoId={videoItem?.id} channelColor={ch.color} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
function ItemGrid({ items, onPlay, activeMusicId, activeVideoId, channelColor }: {
  items: VaultItem[]
  onPlay: (item: VaultItem) => void
  activeMusicId?: string
  activeVideoId?: string
  channelColor: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
      {items.map(item => (
        <ItemCard key={item.id} item={item} onPlay={onPlay}
          isActiveMusic={activeMusicId === item.id} isActiveVideo={activeVideoId === item.id} channelColor={channelColor} />
      ))}
    </div>
  )
}

function ItemCard({ item, onPlay, isActiveMusic, isActiveVideo }: {
  item: VaultItem; onPlay: (item: VaultItem) => void
  isActiveMusic: boolean; isActiveVideo: boolean; channelColor: string
}) {
  const [hover, setHover] = useState(false)
  const isActive = isActiveMusic || isActiveVideo
  const catEmoji = ({ pelicula: '🎬', musica: '🎵', musicvideo: '🎥' } as Record<string, string>)[item.category] ?? '📁'
  const chColor = CHANNEL_LABELS[item.channel].color

  return (
    <div onClick={() => onPlay(item)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: isActive ? `${chColor}18` : (hover ? '#1e2435' : '#161922'), border: `1px solid ${isActive ? chColor : (hover ? '#2a3448' : '#1e2435')}`, borderRadius: 12, cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s', transform: hover && !isActive ? 'translateY(-2px)' : 'none', position: 'relative' }}>

      {/* Barra indicadora superior cuando está sonando */}
      {isActiveMusic && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${chColor}, ${chColor}88)`, zIndex: 1 }} />
      )}

      {/* Thumbnail */}
      <div style={{ height: 130, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {item.thumbnail
          ? <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 42 }}>{catEmoji}</span>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover || isActive ? 1 : 0, transition: 'opacity 0.15s' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: chColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1117' }}>
            {isActiveMusic ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
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
            ) : <Icon.Play />}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 8, right: 8, background: `${chColor}22`, border: `1px solid ${chColor}44`, borderRadius: 6, padding: '2px 6px', fontSize: 10, color: chColor }}>
          {item.channel === 'cami' ? '✝️' : '🎭'}
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
        {item.plays > 0 && <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>▶ {item.plays} reproducciones</div>}
      </div>
    </div>
  )
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────
function EmptyState({ channel, category, query }: { channel: VaultChannel; category: VaultCategory | 'all'; query: string }) {
  const isFiltered = category !== 'all' || query
  const catLabel = ({ pelicula: 'películas', musica: 'música', musicvideo: 'videoclips', all: 'contenido' } as Record<string, string>)[category]
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{isFiltered ? '🔍' : '📭'}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color: '#94a3b8', marginBottom: 8 }}>{isFiltered ? 'Sin resultados' : 'Aún no hay contenido aquí'}</div>
      <div style={{ fontSize: 13, color: '#475569', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>
        {isFiltered
          ? `No encontramos ${catLabel} con esos filtros.`
          : `El ${CHANNEL_LABELS[channel].label} está preparado. El seeder cargará contenido en breve.`
        }
      </div>
      {!isFiltered && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
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
