import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getHealth } from './api/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateModal } from './components/UpdateModal'
import { HomeButton } from './components/HomeButton'
import { NetworkStatus } from './components/NetworkStatus'
import { FeedbackAI } from './components/FeedbackAI'
import { AtlasCompanion } from './components/AtlasCompanion'
import { OwnerPanel } from './components/OwnerPanel'
import { DivisasWidget } from './components/DivisasWidget'
import { DigestButton } from './components/DigestButton'
import { ExchangeWidget } from './components/ExchangeWidget'
import { DigestPanel } from './components/DigestPanel'
import { AccessGate } from './pages/AccessGate'
import { SearchPage } from './pages/SearchPage'
import { VideoPage } from './pages/VideoPage'
import { ChatPage } from './pages/ChatPage'
import { CamiPage } from './pages/CamiPage'
import { AccessPage } from './pages/AccessPage'
import { TikTokPage } from './pages/TikTokPage'
import { YouTubePage } from './pages/YouTubePage'
import { RadioPage } from './pages/RadioPage'
import { NoticiasPage } from './pages/NoticiasPage'
import { ClimaPage } from './pages/ClimaPage'
import { TraducirPage } from './pages/TraducirPage'
import VaultPage from './pages/VaultPage'
import { VaultPlayerProvider, useVaultPlayer } from './contexts/VaultPlayerContext'
import { APP_VERSION, CHANGELOG } from './constants/version'

type Tab = 'search' | 'video' | 'tiktok' | 'chat' | 'cami' | 'access'
         | 'youtube' | 'radio' | 'noticias' | 'clima' | 'traducir' | 'vault'

const TABS: { id: Tab; label: string; shortLabel: string; icon: string }[] = [
  { id: 'search',   label: 'Búsqueda',    shortLabel: 'Buscar',  icon: '🔍' },
  { id: 'video',    label: 'TV',          shortLabel: 'TV',      icon: '📺' },
  { id: 'youtube',  label: 'YouTube',     shortLabel: 'YT',      icon: '▶' },
  { id: 'tiktok',   label: 'TikTok',      shortLabel: 'TikTok',  icon: '🎬' },
  { id: 'radio',    label: 'Radio',       shortLabel: 'Radio',   icon: '📻' },
  { id: 'noticias', label: 'Noticias',    shortLabel: 'Noticias',icon: '📰' },
  { id: 'chat',     label: 'IA',          shortLabel: 'IA',      icon: '💬' },
  { id: 'cami',     label: 'CAMI',        shortLabel: 'CAMI',    icon: '🎵' },
  { id: 'vault',    label: 'Bóveda',      shortLabel: 'Bóveda',  icon: '📦' },
  { id: 'clima',    label: 'Clima',       shortLabel: 'Clima',   icon: '☀️' },
  { id: 'traducir', label: 'Traducir',    shortLabel: 'Traduc.', icon: '🌐' },
  { id: 'access',   label: 'Acceso',      shortLabel: 'Acceso',  icon: '🔐' },
]

// Pestañas principales en la barra inferior móvil
const BOTTOM_TABS: Tab[] = ['search', 'video', 'vault', 'cami', 'chat']

const USER_TOKEN_KEY = 'rauli_user_token'

/** Comprueba y persiste el código de acceso desde la URL o el localStorage. */
function resolveAccessToken(): string {
  try {
    const params = new URLSearchParams(window.location.search)
    const uParam = params.get('u')?.trim().toUpperCase()
    if (uParam) {
      localStorage.setItem(USER_TOKEN_KEY, uParam)
      const cleanUrl = window.location.pathname + (window.location.hash || '')
      window.history.replaceState(null, '', cleanUrl)
      return uParam
    }
    return localStorage.getItem(USER_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Componente raíz: gestiona autenticación y decide si mostrar el gate o la app. */
export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(() => !!resolveAccessToken())

  const handleAuthenticated = (code: string) => {
    localStorage.setItem(USER_TOKEN_KEY, code)
    setAuthenticated(true)
  }

  if (!authenticated) {
    return (
      <ErrorBoundary>
        <AccessGate onAuthenticated={handleAuthenticated} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <VaultPlayerProvider>
        <AppContent />
      </VaultPlayerProvider>
    </ErrorBoundary>
  )
}

/** Contenido principal de la app (solo se monta si el usuario está autenticado). */
function AppContent() {
  const [tab, setTab] = useState<Tab>('search')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  // Forzar desregistro del SW si la versión cambió — garantiza código fresco
  useEffect(() => {
    const SW_VERSION_KEY = 'rv_sw_version'
    const stored = localStorage.getItem(SW_VERSION_KEY)
    if (stored !== APP_VERSION && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        if (regs.length === 0) {
          localStorage.setItem(SW_VERSION_KEY, APP_VERSION)
          return
        }
        // Preservar token de usuario antes del reload
        const userToken = localStorage.getItem('rauli_user_token')
        Promise.all(regs.map(r => r.unregister())).then(() => {
          localStorage.setItem(SW_VERSION_KEY, APP_VERSION)
          if (userToken) localStorage.setItem('rauli_user_token', userToken)
          window.location.reload()
        })
      })
    } else {
      localStorage.setItem(SW_VERSION_KEY, APP_VERSION)
    }
  }, [])

  // Cerrar drawer con tecla Escape
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen])

  const navigateTo = (t: Tab) => {
    setTab(t)
    setDrawerOpen(false)
  }

  const { data: health, isSuccess } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30000,
  })

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      registrationRef.current = registration ?? null
    },
  })

  const [needRefreshState, setNeedRefreshState] = needRefresh

  const handleCheckUpdate = () => {
    setCheckingUpdate(true)
    registrationRef.current?.update()?.finally(() => setCheckingUpdate(false))
    if (!registrationRef.current) setCheckingUpdate(false)
  }

  const handleUpdate = () => {
    setNeedRefreshState(false)
    updateServiceWorker()
  }

  const connected = isSuccess && health?.espejo !== 'unreachable'

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg text-[#e6edf3] flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="border-b border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.9)] backdrop-blur sticky top-0 z-20">
          {/* Fila superior: logo + botón actualización (desktop) */}
          <div className="max-w-6xl mx-auto px-4 pt-2.5 pb-0 flex items-center justify-between gap-3">
            {/* Logo + estado */}
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-lg font-semibold text-accent tracking-tight whitespace-nowrap">RAULI-VISION</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${connected ? 'text-success border-success/60' : 'text-muted border-[rgba(56,139,253,0.3)]'}`}>
                {connected ? '● Conectado' : '○ Local'}
              </span>
            </div>
            {/* Desktop: botón actualización */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="text-xs px-2 py-1 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50 transition disabled:opacity-50 whitespace-nowrap"
              >
                {checkingUpdate ? 'Buscando…' : 'Actualizar'}
              </button>
            </div>

            {/* Mobile: acciones compactas */}
            <div className="md:hidden flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="text-xs p-1.5 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent transition disabled:opacity-50"
                title="Buscar actualización"
                aria-label="Buscar actualización"
              >
                {checkingUpdate ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-muted border-t-transparent animate-spin inline-block" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Fila inferior: nav de tabs — solo desktop, scrollable */}
          <div className="hidden md:block border-t border-[rgba(56,139,253,0.15)]">
            <div className="max-w-6xl mx-auto px-4">
              <nav className="flex overflow-x-auto scrollbar-hide gap-0.5 py-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                      tab === t.id ? 'bg-accent/20 text-accent' : 'text-muted hover:text-[#e6edf3]'
                    }`}
                  >
                    <span>{t.icon}</span>
                    <span>{t.shortLabel}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>

        {/* ── Content wrapper — 2-column on desktop ─────────────────────── */}
        <div className="max-w-6xl mx-auto px-4 flex gap-6 flex-1 w-full">

          {/* Left column — main content */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Subtítulo — solo desktop */}
            <div className="hidden md:block py-2 text-center">
              <p className="text-muted text-sm">Internet curado · Búsqueda ligera · Video comprimido · IA que resume</p>
            </div>

            {/* pb-20: espacio para la bottom nav en móvil */}
            <main className="py-6 flex-1 w-full pb-20 md:pb-6">
              {tab === 'search'   && <SearchPage />}
              {tab === 'video'    && <VideoPage />}
              {tab === 'tiktok'   && <TikTokPage />}
              {tab === 'chat'     && <ChatPage />}
              {tab === 'cami'     && <CamiPage />}
              {tab === 'vault'    && <VaultPage />}
              {tab === 'access'   && <AccessPage />}
              {tab === 'youtube'  && <YouTubePage />}
              {tab === 'radio'    && <RadioPage />}
              {tab === 'noticias' && <NoticiasPage />}
              {tab === 'clima'    && <ClimaPage />}
              {tab === 'traducir' && <TraducirPage />}
            </main>
          </div>

          {/* Right sidebar — desktop only */}
          <aside className="hidden md:flex flex-col w-64 shrink-0 gap-4 py-4">
            <ExchangeWidget />
            <DigestPanel />
          </aside>

        </div>

        {/* ── Footer — solo desktop ───────────────────────────────────────── */}
        <footer className="hidden md:block border-t border-[rgba(56,139,253,0.2)] py-4 text-center text-muted text-xs space-y-1">
          <div>RAULI-VISION · Protocolo negapro.t · Full Operations · Internet curado para entornos de bajo ancho de banda</div>
          <div>Dashboard v{APP_VERSION}{health?.version ? ` · API v${health.version}` : ''}</div>
          <div className="flex items-center justify-center gap-2 pt-0.5 opacity-70">
            <span>Desarrollado por <span className="text-accent font-medium">Ing. Raúl Martínez Ramírez</span></span>
            <span className="text-[rgba(56,139,253,0.4)]">·</span>
            <span>IA <span className="text-[#a8b3c0] font-medium">Gemini 2.5 Flash</span> · Asistente <span className="text-[#a8b3c0] font-medium">Claude Sonnet</span></span>
          </div>
        </footer>

        {/* ── Drawer lateral izquierdo — solo móvil ───────────────────────── */}
        {drawerOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* Overlay oscuro */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            {/* Panel del drawer */}
            <aside
              className="relative z-10 w-72 max-w-[85vw] h-full bg-[rgba(13,17,23,0.98)] border-r border-[rgba(56,139,253,0.25)] flex flex-col shadow-2xl shadow-black/60"
              style={{ animation: 'slideInLeft 0.22s cubic-bezier(0.22,1,0.36,1)' }}
            >
              {/* Cabecera del drawer */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(56,139,253,0.2)]">
                <div>
                  <h2 className="text-base font-semibold text-accent tracking-tight">RAULI-VISION</h2>
                  <p className="text-[10px] text-muted/60 mt-0.5">Todas las secciones</p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center border border-[rgba(56,139,253,0.2)] text-muted hover:text-[#e6edf3] hover:border-accent/40 transition"
                  aria-label="Cerrar menú"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Grid de pestañas */}
              <nav className="flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-3 gap-2.5">
                  {TABS.map((t) => {
                    const active = tab === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => navigateTo(t.id)}
                        className={`flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-xl border transition-all active:scale-95 ${
                          active
                            ? 'bg-accent/20 border-accent/50 text-accent shadow-lg shadow-accent/10'
                            : 'bg-[rgba(22,27,34,0.6)] border-[rgba(56,139,253,0.15)] text-muted hover:border-accent/30 hover:text-[#e6edf3] hover:bg-[rgba(56,139,253,0.08)]'
                        }`}
                        aria-label={t.label}
                      >
                        <span className="text-2xl leading-none">{t.icon}</span>
                        <span className={`text-[10px] font-medium leading-none text-center ${active ? 'text-accent' : 'text-muted/70'}`}>
                          {t.shortLabel}
                        </span>
                        {active && (
                          <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </nav>

              {/* Footer del drawer: divisas + digest + versión */}
              <div className="px-4 py-3 border-t border-[rgba(56,139,253,0.15)] space-y-2.5">
                {/* Tasas de cambio */}
                <div className="flex items-center gap-1 text-[10px] text-muted/60">
                  <span className="shrink-0">💱</span>
                  <DivisasWidget />
                </div>
                {/* Resumen del día */}
                <DigestButton />
                <p className="text-[9px] text-muted/40 text-center">v{APP_VERSION} · Ing. Raúl Martínez</p>
              </div>
            </aside>
          </div>
        )}

        {/* ── Bottom navigation bar — solo móvil ─────────────────────────── */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(56,139,253,0.3)] bg-[rgba(13,17,23,0.97)] backdrop-blur-md"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-stretch">
            {/* Botón hamburguesa — izquierda */}
            <button
              onClick={() => setDrawerOpen(true)}
              className={`flex flex-col items-center justify-center gap-1 px-4 py-2.5 border-r border-[rgba(56,139,253,0.2)] transition-colors min-w-[56px] ${
                drawerOpen ? 'text-accent bg-accent/10' : 'text-muted/70 active:text-[#e6edf3]'
              }`}
              aria-label="Abrir menú"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[8px] font-medium uppercase tracking-wide">Menú</span>
            </button>

            {/* 5 pestañas principales */}
            <div className="flex flex-1">
              {BOTTOM_TABS.map((id) => {
                const t = TABS.find(x => x.id === id)!
                const active = tab === id
                return (
                  <button
                    key={id}
                    onClick={() => navigateTo(id)}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative transition-colors ${
                      active ? 'text-accent' : 'text-muted/70 active:text-[#e6edf3]'
                    }`}
                    aria-label={t.label}
                  >
                    {active && (
                      <span className="absolute top-0 inset-x-2 h-0.5 rounded-b-full bg-accent" />
                    )}
                    <span className={`text-xl leading-none transition-transform ${active ? 'scale-115' : 'scale-100'}`} aria-hidden="true">
                      {t.icon}
                    </span>
                    <span className={`text-[9px] font-medium leading-none tracking-wide uppercase ${active ? 'text-accent' : 'text-muted/60'}`}>
                      {t.shortLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </nav>

        {needRefreshState && (
          <UpdateModal
            version={APP_VERSION}
            changelog={CHANGELOG}
            onUpdate={handleUpdate}
            onLater={() => setNeedRefreshState(false)}
          />
        )}
        <VaultMiniPlayer />
        <NetworkStatus />
        <HomeButton />
        <FeedbackAI />
        <OwnerPanel />
        <AtlasCompanion />
      </div>
    </ErrorBoundary>
  )
}

// ─── Mini-player persistente de música ────────────────────────────────────────
// Aparece sobre la barra de navegación en móvil (bottom-14 = 56px) y
// al borde inferior en escritorio (bottom-0).
// v2: barra de progreso, botón anterior, altura 72px.
function VaultMiniPlayer() {
  const { currentItem, isPlaying, shuffleOn, progress, duration, togglePlay, stop, next, prev, seek, toggleShuffle } = useVaultPlayer()
  if (!currentItem) return null

  const chColor = currentItem.channel === 'cami' ? '#a78bfa' : '#38bdf8'
  const chLabel = currentItem.channel === 'cami' ? '✝' : '★'

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    seek((e.clientX - rect.left) / rect.width)
  }

  const elapsed = duration > 0 ? Math.floor(duration * progress) : 0
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <>
      <style>{`@media (min-width: 768px) { .rv-miniplayer { bottom: 0 !important; } }`}</style>
      <div
        className="rv-miniplayer fixed left-0 right-0 z-40"
        style={{
          bottom: 56,
          background: 'rgba(13,17,23,0.97)',
          borderTop: `2px solid ${chColor}66`,
          backdropFilter: 'blur(12px)',
          padding: '8px 16px 6px',
          height: 72,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {/* Fila principal: acento + info + controles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Acento de color */}
          <div style={{ width: 4, height: 32, borderRadius: 2, background: chColor, flexShrink: 0 }} />

          {/* Canal + info de pista */}
          <div style={{ fontSize: 16, flexShrink: 0 }}>{chLabel}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
              {currentItem.title}
            </div>
            {currentItem.artist && (
              <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentItem.artist}
              </div>
            )}
          </div>

          {/* Controles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>

            {/* Shuffle on/off */}
            <button onClick={toggleShuffle} title={shuffleOn ? 'Aleatorio: ON' : 'Aleatorio: OFF'}
              style={{ background: shuffleOn ? `${chColor}25` : 'none', border: `1px solid ${shuffleOn ? chColor : '#2a3448'}`, borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: shuffleOn ? chColor : '#475569', transition: 'all 0.15s' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="13" height="13">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
            </button>

            {/* Anterior */}
            <button onClick={prev} title="Anterior"
              style={{ background: 'none', border: '1px solid #2a3448', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', transition: 'all 0.15s' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth={2} fill="none"/>
                <polygon points="19 4 9 12 19 20 19 4"/>
              </svg>
            </button>

            {/* Play / Pause */}
            <button onClick={togglePlay} title={isPlaying ? 'Pausar' : 'Continuar'}
              style={{ background: chColor, border: 'none', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0f1117', flexShrink: 0, boxShadow: `0 0 10px ${chColor}55` }}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              )}
            </button>

            {/* Siguiente */}
            <button onClick={next} title="Siguiente aleatoria"
              style={{ background: 'none', border: '1px solid #2a3448', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', transition: 'all 0.15s' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                <polygon points="5 4 15 12 5 20 5 4"/>
                <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth={2} fill="none"/>
              </svg>
            </button>

            {/* Detener / Desconectar */}
            <button onClick={stop} title="Detener y desconectar"
              style={{ background: 'none', border: '1px solid #3f1515', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444', transition: 'all 0.15s' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Barra de progreso + tiempo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#475569', flexShrink: 0, minWidth: 26, textAlign: 'right' }}>{fmt(elapsed)}</span>
          <div
            onClick={handleBarClick}
            style={{ flex: 1, height: 4, background: '#1e2435', borderRadius: 2, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
          >
            <div style={{ height: '100%', width: `${progress * 100}%`, background: chColor, borderRadius: 2, transition: 'width 0.4s linear' }} />
          </div>
          {duration > 0 && (
            <span style={{ fontSize: 9, color: '#334155', flexShrink: 0, minWidth: 26 }}>
              {fmt(Math.floor(duration))}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
