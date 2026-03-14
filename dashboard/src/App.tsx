import { useState, useRef, useEffect } from 'react'
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
import { APP_VERSION, CHANGELOG } from './constants/version'

type Tab = 'search' | 'video' | 'tiktok' | 'chat' | 'cami' | 'access'
         | 'youtube' | 'radio' | 'noticias' | 'clima' | 'traducir'

const TABS: { id: Tab; label: string; shortLabel: string; icon: string }[] = [
  { id: 'search',   label: 'Búsqueda',    shortLabel: 'Buscar',  icon: '🔍' },
  { id: 'video',    label: 'TV',          shortLabel: 'TV',      icon: '📺' },
  { id: 'youtube',  label: 'YouTube',     shortLabel: 'YT',      icon: '▶' },
  { id: 'tiktok',   label: 'TikTok',      shortLabel: 'TikTok',  icon: '🎬' },
  { id: 'radio',    label: 'Radio',       shortLabel: 'Radio',   icon: '📻' },
  { id: 'noticias', label: 'Noticias',    shortLabel: 'Noticias',icon: '📰' },
  { id: 'chat',     label: 'IA',          shortLabel: 'IA',      icon: '💬' },
  { id: 'cami',     label: 'CAMI',        shortLabel: 'CAMI',    icon: '🎵' },
  { id: 'clima',    label: 'Clima',       shortLabel: 'Clima',   icon: '☀️' },
  { id: 'traducir', label: 'Traducir',    shortLabel: 'Traduc.', icon: '🌐' },
  { id: 'access',   label: 'Acceso',      shortLabel: 'Acceso',  icon: '🔐' },
]

// Pestañas principales en la barra inferior móvil
const BOTTOM_TABS: Tab[] = ['search', 'video', 'youtube', 'tiktok', 'chat']

export default function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

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
              {/* Divisas widget — desktop */}
              <div className="hidden md:flex items-center gap-1 pl-2 border-l border-[rgba(56,139,253,0.2)]">
                <DivisasWidget />
              </div>
            </div>
            {/* Desktop: Resumen del Día + botón actualización */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              <DigestButton />
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
                  <svg xmlns="http://www.w3.org/2020/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

        {/* Subtítulo — solo desktop */}
        <div className="hidden md:block max-w-4xl mx-auto px-4 py-2 text-center">
          <p className="text-muted text-sm">Internet curado · Búsqueda ligera · Video comprimido · IA que resume</p>
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        {/* pb-20: espacio para la bottom nav en móvil */}
        <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full pb-20 md:pb-6">
          {tab === 'search'   && <SearchPage />}
          {tab === 'video'    && <VideoPage />}
          {tab === 'tiktok'   && <TikTokPage />}
          {tab === 'chat'     && <ChatPage />}
          {tab === 'cami'     && <CamiPage />}
          {tab === 'access'   && <AccessPage />}
          {tab === 'youtube'  && <YouTubePage />}
          {tab === 'radio'    && <RadioPage />}
          {tab === 'noticias' && <NoticiasPage />}
          {tab === 'clima'    && <ClimaPage />}
          {tab === 'traducir' && <TraducirPage />}
        </main>

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
        <NetworkStatus />
        <HomeButton />
        <FeedbackAI />
        <OwnerPanel />
        <AtlasCompanion />
      </div>
    </ErrorBoundary>
  )
}
