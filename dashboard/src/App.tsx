import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getHealth } from './api/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateModal } from './components/UpdateModal'
import { HomeButton } from './components/HomeButton'
import { NetworkStatus } from './components/NetworkStatus'
import { FeedbackAI } from './components/FeedbackAI'
import { AtlasCompanion } from './components/AtlasCompanion'
import { SearchPage } from './pages/SearchPage'
import { VideoPage } from './pages/VideoPage'
import { ChatPage } from './pages/ChatPage'
import { CamiPage } from './pages/CamiPage'
import { AccessPage } from './pages/AccessPage'
import { TikTokPage } from './pages/TikTokPage'
import { APP_VERSION, CHANGELOG } from './constants/version'

type Tab = 'search' | 'video' | 'tiktok' | 'chat' | 'cami' | 'access'

const TABS: { id: Tab; label: string; shortLabel: string; icon: string }[] = [
  { id: 'search', label: 'Búsqueda', shortLabel: 'Buscar', icon: '🔍' },
  { id: 'video',  label: 'Video',    shortLabel: 'Video',  icon: '📺' },
  { id: 'tiktok', label: 'TikTok',   shortLabel: 'TikTok', icon: '▶' },
  { id: 'chat',   label: 'IA',       shortLabel: 'IA',     icon: '💬' },
  { id: 'cami',   label: 'CAMI',     shortLabel: 'CAMI',   icon: '🎵' },
  { id: 'access', label: 'Acceso',   shortLabel: 'Acceso', icon: '🔐' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

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
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

            {/* Logo + estado */}
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-lg font-semibold text-accent tracking-tight whitespace-nowrap">RAULI-VISION</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${connected ? 'text-success border-success/60' : 'text-muted border-[rgba(56,139,253,0.3)]'}`}>
                {connected ? '● Conectado' : '○ Local'}
              </span>
            </div>

            {/* Desktop: botón actualización + nav */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="text-xs px-2 py-1 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50 transition disabled:opacity-50 whitespace-nowrap"
              >
                {checkingUpdate ? 'Buscando…' : 'Buscar actualización'}
              </button>
              <nav className="flex gap-0.5">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                      tab === t.id ? 'bg-accent/20 text-accent' : 'text-muted hover:text-[#e6edf3]'
                    }`}
                  >
                    {t.id === 'tiktok' ? `${t.icon} ${t.label}` : t.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Mobile: botón actualización compacto */}
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="md:hidden flex-shrink-0 text-xs p-1.5 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent transition disabled:opacity-50"
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
        </header>

        {/* Subtítulo — solo desktop */}
        <div className="hidden md:block max-w-4xl mx-auto px-4 py-2 text-center">
          <p className="text-muted text-sm">Internet curado · Búsqueda ligera · Video comprimido · IA que resume</p>
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        {/* pb-20: espacio para la bottom nav en móvil */}
        <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full pb-20 md:pb-6">
          {tab === 'search' && <SearchPage />}
          {tab === 'video'  && <VideoPage />}
          {tab === 'tiktok' && <TikTokPage />}
          {tab === 'chat'   && <ChatPage />}
          {tab === 'cami'   && <CamiPage />}
          {tab === 'access' && <AccessPage />}
        </main>

        {/* ── Footer — solo desktop ───────────────────────────────────────── */}
        <footer className="hidden md:block border-t border-[rgba(56,139,253,0.2)] py-3 text-center text-muted text-xs space-y-0.5">
          <div>RAULI-VISION · Protocolo negapro.t · Full Operations · Internet curado para entornos de bajo ancho de banda</div>
          <div>Dashboard v{APP_VERSION}{health?.version ? ` · API v${health.version}` : ''}</div>
        </footer>

        {/* ── Bottom navigation bar — solo móvil ─────────────────────────── */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-[rgba(56,139,253,0.3)] bg-[rgba(13,17,23,0.97)] backdrop-blur-md safe-area-bottom"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex">
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative transition-colors ${
                    active ? 'text-accent' : 'text-muted/70 active:text-[#e6edf3]'
                  }`}
                  aria-label={t.label}
                >
                  {/* Indicador activo */}
                  {active && (
                    <span className="absolute top-0 inset-x-0 h-0.5 rounded-b-full bg-accent" />
                  )}
                  <span
                    className={`text-base leading-none transition-transform ${active ? 'scale-110' : 'scale-100'}`}
                    aria-hidden="true"
                  >
                    {t.icon}
                  </span>
                  <span className={`text-[9px] font-medium leading-none tracking-wide uppercase ${active ? 'text-accent' : 'text-muted/60'}`}>
                    {t.shortLabel}
                  </span>
                </button>
              )
            })}
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
        <AtlasCompanion />
      </div>
    </ErrorBoundary>
  )
}
