import { useState, useEffect, useRef, useCallback } from 'react'
import {
  VaultItem, VaultChannel, VaultCategory,
  getVaultCatalog, vaultStreamUrl, formatDuration, formatSize,
} from '../api/vaultApi'

// ─── Iconos inline SVG ────────────────────────────────────────────────────────
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
  Cross: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M12 2v20M2 12h20"/>
    </svg>
  ),
  Wifi: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
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

// ─── Tipos locales ─────────────────────────────────────────────────────────────
interface PlayerState {
  item: VaultItem | null
  playing: boolean
}

const CHANNEL_LABELS: Record<VaultChannel, { label: string; desc: string; color: string }> = {
  cami:    { label: 'Canal CAMI', desc: 'Música cristiana · Cine cristiano', color: '#a78bfa' },
  variado: { label: 'Canal Variado', desc: 'Entretenimiento general', color: '#38bdf8' },
}

const CATEGORY_TABS: { id: VaultCategory | 'all'; label: string; icon: keyof typeof Icon }[] = [
  { id: 'all',        label: 'Todo',       icon: 'Search' },
  { id: 'pelicula',   label: 'Películas',  icon: 'Film'   },
  { id: 'musica',     label: 'Música',     icon: 'Music'  },
  { id: 'musicvideo', label: 'Videoclips', icon: 'Video'  },
]

// ─── Componente principal ──────────────────────────────────────────────────────
export default function VaultPage() {
  const [channel, setChannel] = useState<VaultChannel>('cami')
  const [category, setCategory] = useState<VaultCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<VaultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerState>({ item: null, playing: false })
  const videoRef = useRef<HTMLVideoElement>(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getVaultCatalog({
        channel,
        category: category === 'all' ? undefined : category,
        q: query || undefined,
      })
      setItems(res.items ?? [])
    } catch {
      setError('No se pudo cargar el Vault. Verifica la conexión con el espejo.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [channel, category, query])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  const openPlayer = (item: VaultItem) => {
    setPlayer({ item, playing: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closePlayer = () => {
    if (videoRef.current) videoRef.current.pause()
    setPlayer({ item: null, playing: false })
  }

  const ch = CHANNEL_LABELS[channel]

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1a1d2e 0%, #0f1117 100%)', borderBottom: '1px solid #1e2435', padding: '16px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>🎬</span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>RAULI Vault</h1>
            <span style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
              padding: '2px 8px', fontSize: 11, color: '#94a3b8', marginLeft: 4,
            }}>
              <span style={{ marginRight: 4 }}>⚡</span>Sin Internet
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Contenido disponible sin conexión — películas, música y videoclips curados
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Selector de canal ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {(Object.keys(CHANNEL_LABELS) as VaultChannel[]).map(ch => {
            const info = CHANNEL_LABELS[ch]
            const active = channel === ch
            return (
              <button
                key={ch}
                onClick={() => { setChannel(ch); setCategory('all') }}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: active ? `${info.color}18` : '#1a1d2e',
                  outline: active ? `2px solid ${info.color}` : '2px solid transparent',
                  transition: 'all 0.2s', textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: active ? info.color : '#94a3b8' }}>
                  {ch === 'cami' ? '✝️ ' : '🎭 '}{info.label}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{info.desc}</div>
              </button>
            )
          })}
        </div>

        {/* ── Player ─────────────────────────────────────────────────────────── */}
        {player.item && (
          <div style={{
            background: '#0d1117', borderRadius: 14, border: '1px solid #1e2435',
            marginBottom: 20, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e2435' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>{player.item.title}</div>
                {player.item.artist && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{player.item.artist}</div>}
              </div>
              <button onClick={closePlayer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                <Icon.X />
              </button>
            </div>
            {player.item.category === 'musica' ? (
              <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 10, background: '#1a1d2e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 30 }}>🎵</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
                    {player.item.genre || 'Música'} · {formatDuration(player.item.duration_secs)}
                  </div>
                  <audio
                    ref={videoRef as any}
                    src={vaultStreamUrl(player.item.id)}
                    controls
                    autoPlay
                    style={{ width: '100%', accentColor: ch.color }}
                  />
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                src={vaultStreamUrl(player.item.id)}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: 420, background: '#000', display: 'block' }}
              />
            )}
          </div>
        )}

        {/* ── Tabs de categoría ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {CATEGORY_TABS.map(tab => {
            const active = category === tab.id
            const TabIcon = Icon[tab.icon]
            return (
              <button
                key={tab.id}
                onClick={() => setCategory(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: active ? ch.color : '#1a1d2e',
                  color: active ? '#0f1117' : '#64748b',
                  fontWeight: active ? 600 : 400, fontSize: 13,
                  whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}
              >
                <TabIcon />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Barra de búsqueda ─────────────────────────────────────────────── */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}>
            <Icon.Search />
          </div>
          <input
            type="text"
            placeholder="Buscar título, artista, género..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10,
              background: '#1a1d2e', border: '1px solid #1e2435', color: '#e2e8f0',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#475569',
            }}>
              <Icon.X />
            </button>
          )}
        </div>

        {/* ── Contenido ──────────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            <div>Cargando catálogo...</div>
          </div>
        )}

        {error && (
          <div style={{
            background: '#1a0f0f', border: '1px solid #7f1d1d', borderRadius: 10,
            padding: '14px 16px', color: '#fca5a5', fontSize: 14, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon.WifiOff />{error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState channel={channel} category={category} query={query} />
        )}

        {!loading && items.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
              {items.length} {items.length === 1 ? 'resultado' : 'resultados'}
              {query && ` para "${query}"`}
            </div>
            <ItemGrid items={items} onPlay={openPlayer} activeId={player.item?.id} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Grid de items ────────────────────────────────────────────────────────────
function ItemGrid({ items, onPlay, activeId }: {
  items: VaultItem[]
  onPlay: (item: VaultItem) => void
  activeId?: string
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 12,
    }}>
      {items.map(item => (
        <ItemCard key={item.id} item={item} onPlay={onPlay} isActive={activeId === item.id} />
      ))}
    </div>
  )
}

function ItemCard({ item, onPlay, isActive }: {
  item: VaultItem
  onPlay: (item: VaultItem) => void
  isActive: boolean
}) {
  const [hover, setHover] = useState(false)
  const catEmoji = { pelicula: '🎬', musica: '🎵', musicvideo: '🎥' }[item.category] ?? '📁'
  const chColor = CHANNEL_LABELS[item.channel].color

  return (
    <div
      onClick={() => onPlay(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: isActive ? `${chColor}12` : (hover ? '#1e2435' : '#161922'),
        border: `1px solid ${isActive ? chColor : '#1e2435'}`,
        borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
        transition: 'all 0.15s', transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 130, background: '#0d1117', display: 'flex', alignItems: 'center',
        justifyContent: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 42 }}>{catEmoji}</span>
        )}
        {/* Play overlay */}
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hover || isActive ? 1 : 0, transition: 'opacity 0.15s',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: chColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#0f1117',
          }}>
            <Icon.Play />
          </div>
        </div>
        {/* Canal badge */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: `${chColor}22`, border: `1px solid ${chColor}44`,
          borderRadius: 6, padding: '2px 6px', fontSize: 10, color: chColor,
        }}>
          {item.channel === 'cami' ? '✝️' : '🎭'}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{
          fontWeight: 600, fontSize: 13, color: '#e2e8f0',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 4,
        }}>
          {item.title}
        </div>
        {item.artist && (
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.artist}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.genre && (
            <span style={{ background: '#1e2435', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: '#64748b' }}>
              {item.genre}
            </span>
          )}
          {item.duration_secs ? (
            <span style={{ fontSize: 10, color: '#475569' }}>{formatDuration(item.duration_secs)}</span>
          ) : null}
          {item.file_size_bytes ? (
            <span style={{ fontSize: 10, color: '#334155' }}>{formatSize(item.file_size_bytes)}</span>
          ) : null}
        </div>
        {item.plays > 0 && (
          <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>▶ {item.plays} reproducciones</div>
        )}
      </div>
    </div>
  )
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────
function EmptyState({ channel, category, query }: {
  channel: VaultChannel
  category: VaultCategory | 'all'
  query: string
}) {
  const isFiltered = category !== 'all' || query
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>
        {isFiltered ? '🔍' : channel === 'cami' ? '✝️' : '🎭'}
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, color: '#94a3b8', marginBottom: 6 }}>
        {isFiltered ? 'Sin resultados' : 'Canal vacío'}
      </div>
      <div style={{ fontSize: 13, color: '#475569', maxWidth: 300, margin: '0 auto' }}>
        {isFiltered
          ? 'Prueba con otros filtros o términos de búsqueda.'
          : `El ${CHANNEL_LABELS[channel].label} aún no tiene contenido cargado. El administrador puede subir archivos vía la API del Vault.`
        }
      </div>
      {!isFiltered && (
        <div style={{
          marginTop: 20, background: '#1a1d2e', borderRadius: 10, padding: '12px 16px',
          display: 'inline-block', textAlign: 'left', fontSize: 12, color: '#475569',
        }}>
          <code>POST /api/vault/admin/upload</code>
          <div style={{ marginTop: 4 }}>Sube películas, música y videoclips al catálogo</div>
        </div>
      )}
    </div>
  )
}
