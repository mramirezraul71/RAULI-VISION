import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { radioPopular, radioSearch, radioByCountry, type RadioStation } from '../api/client'

const COUNTRIES = [
  { code: 'CU', label: '🇨🇺 Cuba' },
  { code: 'US', label: '🇺🇸 EE.UU.' },
  { code: 'MX', label: '🇲🇽 México' },
  { code: 'ES', label: '🇪🇸 España' },
  { code: 'CO', label: '🇨🇴 Colombia' },
  { code: 'AR', label: '🇦🇷 Argentina' },
  { code: 'VE', label: '🇻🇪 Venezuela' },
  { code: 'PR', label: '🇵🇷 Puerto Rico' },
]

function StationCard({ station, isPlaying, onPlay }: {
  station: RadioStation
  isPlaying: boolean
  onPlay: (s: RadioStation) => void
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isPlaying
        ? 'border-accent/50 bg-accent/10'
        : 'border-[rgba(56,139,253,0.15)] bg-[rgba(22,27,34,0.6)] hover:border-accent/30'
    }`}>
      {/* Favicon / emoji */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-[rgba(56,139,253,0.1)] flex items-center justify-center border border-[rgba(56,139,253,0.15)]">
        {station.favicon && !imgError ? (
          <img
            src={station.favicon}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-xl">📻</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isPlaying ? 'text-accent' : 'text-[#e6edf3]'}`}>
          {station.name}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-muted text-xs truncate">{station.country}</span>
          {station.codec && (
            <span className="text-[10px] px-1.5 py-px rounded border border-[rgba(56,139,253,0.2)] text-muted/60">
              {station.codec}{station.bitrate > 0 ? ` ${station.bitrate}k` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Botón reproducir */}
      <button
        onClick={() => onPlay(station)}
        className={`flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center text-sm transition ${
          isPlaying
            ? 'bg-accent/20 border-accent/50 text-accent'
            : 'bg-[rgba(56,139,253,0.08)] border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50'
        }`}
      >
        {isPlaying ? '■' : '▶'}
      </button>
    </div>
  )
}

export function RadioPage() {
  const [tab, setTab] = useState<'popular' | 'search' | 'pais'>('popular')
  const [searchQ, setSearchQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [country, setCountry] = useState('CU')
  const [nowPlaying, setNowPlaying] = useState<RadioStation | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Parar al seleccionar la misma estación
  const handlePlay = (station: RadioStation) => {
    if (nowPlaying?.id === station.id) {
      audioRef.current?.pause()
      setNowPlaying(null)
    } else {
      setNowPlaying(station)
    }
  }

  useEffect(() => {
    if (!nowPlaying) return
    if (audioRef.current) {
      audioRef.current.src = nowPlaying.stream_url
      audioRef.current.load()
      audioRef.current.play().catch(() => {})
    }
  }, [nowPlaying])

  const popularQ = useQuery({
    queryKey: ['radioPopular', ''],
    queryFn: () => radioPopular(20, ''),
    staleTime: 30 * 60_000,
    enabled: tab === 'popular',
  })

  const searchQ2 = useQuery({
    queryKey: ['radioSearch', searchQ],
    queryFn: () => radioSearch(searchQ, 20),
    staleTime: 30 * 60_000,
    enabled: tab === 'search' && searchQ.length > 0,
  })

  const countryQ = useQuery({
    queryKey: ['radioCountry', country],
    queryFn: () => radioByCountry(country, 20),
    staleTime: 30 * 60_000,
    enabled: tab === 'pais',
  })

  const activeData = tab === 'popular' ? popularQ : tab === 'search' ? searchQ2 : countryQ
  const stations: RadioStation[] = (activeData.data as any)?.stations ?? []

  return (
    <div className="space-y-4">
      {/* Sticky player */}
      {nowPlaying && (
        <div className="sticky top-0 z-10 rounded-xl border border-accent/40 bg-[rgba(13,17,23,0.97)] backdrop-blur-md p-3 flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">📻</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-accent truncate">{nowPlaying.name}</div>
            <div className="text-muted text-xs">{nowPlaying.country} · {nowPlaying.codec}{nowPlaying.bitrate > 0 ? ` ${nowPlaying.bitrate}kbps` : ''}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="text-accent text-xs">En vivo</span>
          </div>
          <button
            onClick={() => { audioRef.current?.pause(); setNowPlaying(null) }}
            className="flex-shrink-0 w-8 h-8 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs flex items-center justify-center transition"
          >
            ■
          </button>
          <audio ref={audioRef} className="hidden" />
        </div>
      )}
      {!nowPlaying && <audio ref={audioRef} className="hidden" />}

      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#e6edf3]">Radio Online</h2>
        <p className="text-muted text-sm mt-0.5">Miles de estaciones · Radio Browser</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([
          { id: 'popular', label: '🔥 Popular' },
          { id: 'search',  label: '🔍 Buscar' },
          { id: 'pais',    label: '🌎 Por País' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === t.id
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-[rgba(22,27,34,0.5)] text-muted border border-[rgba(56,139,253,0.15)] hover:text-[#e6edf3]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      {tab === 'search' && (
        <form
          onSubmit={e => { e.preventDefault(); setSearchQ(searchInput.trim()) }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Nombre de estación…"
            className="flex-1 bg-[rgba(22,27,34,0.8)] border border-[rgba(56,139,253,0.3)] text-[#e6edf3] rounded-lg px-3 py-2 text-sm placeholder-muted/50 focus:outline-none focus:border-accent/70"
          />
          <button
            type="submit"
            disabled={!searchInput.trim()}
            className="px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded-lg text-sm transition disabled:opacity-50"
          >
            Buscar
          </button>
        </form>
      )}

      {/* Selector de país */}
      {tab === 'pais' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {COUNTRIES.map(c => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition ${
                country === c.code
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-[rgba(22,27,34,0.5)] text-muted border border-[rgba(56,139,253,0.15)] hover:text-[#e6edf3]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {activeData.isLoading && (
        <div className="space-y-2 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-[rgba(56,139,253,0.05)] border border-[rgba(56,139,253,0.1)]" />
          ))}
        </div>
      )}

      {/* Error */}
      {activeData.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          Error: {String(activeData.error)}
        </div>
      )}

      {/* Hint búsqueda vacía */}
      {tab === 'search' && !searchQ && !activeData.isLoading && (
        <div className="text-center py-8 text-muted text-sm">Escribe el nombre de una estación y presiona Buscar</div>
      )}

      {/* Estaciones */}
      {stations.length > 0 && (
        <div className="space-y-2">
          {stations.map(s => (
            <StationCard
              key={s.id}
              station={s}
              isPlaying={nowPlaying?.id === s.id}
              onPlay={handlePlay}
            />
          ))}
        </div>
      )}

      {!activeData.isLoading && stations.length === 0 && (tab !== 'search' || searchQ) && !activeData.error && (
        <div className="text-center py-10 text-muted">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">Sin estaciones disponibles</p>
        </div>
      )}

      {stations.length > 0 && (
        <div className="text-center text-muted/50 text-xs pt-2">{stations.length} estaciones · Radio Browser API</div>
      )}
    </div>
  )
}
