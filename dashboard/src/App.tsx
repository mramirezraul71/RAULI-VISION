import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getHealth } from './api/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateModal } from './components/UpdateModal'
import { HomeButton } from './components/HomeButton'
import { NetworkStatus } from './components/NetworkStatus'
import { FeedbackAI } from './components/FeedbackAI'
import { SearchPage } from './pages/SearchPage'
import { VideoPage } from './pages/VideoPage'
import { ChatPage } from './pages/ChatPage'
import { CamiPage } from './pages/CamiPage'
import { AccessPage } from './pages/AccessPage'
import { APP_VERSION, CHANGELOG } from './constants/version'

type Tab = 'search' | 'video' | 'chat' | 'cami' | 'access'

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
    registrationRef.current
      ?.update()
      ?.then(() => {
        setCheckingUpdate(false)
      })
      ?.catch(() => {
        setCheckingUpdate(false)
      })
    if (!registrationRef.current) setCheckingUpdate(false)
  }

  const handleUpdate = () => {
    setNeedRefreshState(false)
    updateServiceWorker()
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg text-[#e6edf3] flex flex-col">
        <header className="border-b border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.9)] backdrop-blur sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-xl font-semibold text-accent tracking-tight">RAULI-VISION</h1>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full border ${isSuccess && health?.espejo !== 'unreachable' ? 'text-success border-success' : 'text-muted border-[rgba(56,139,253,0.3)]'}`}>
                {isSuccess && health?.espejo !== 'unreachable' ? '● Conectado' : '○ Local'}
              </span>
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="text-xs px-2 py-1 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50 transition disabled:opacity-50"
                title="Buscar actualización"
              >
                {checkingUpdate ? 'Buscando…' : 'Buscar actualización'}
              </button>
              <nav className="flex gap-1">
                {(['search', 'video', 'chat', 'cami', 'access'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-accent/20 text-accent' : 'text-muted hover:text-[#e6edf3]'}`}
                  >
                    {t === 'search'
                      ? 'Búsqueda'
                      : t === 'video'
                        ? 'Video'
                        : t === 'chat'
                          ? 'IA'
                          : t === 'cami'
                            ? 'CAMI'
                            : 'Acceso'}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-2 text-center">
          <p className="text-muted text-sm">Internet curado · Búsqueda ligera · Video comprimido · IA que resume</p>
        </div>
        <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">
          {tab === 'search' && <SearchPage />}
          {tab === 'video' && <VideoPage />}
          {tab === 'chat' && <ChatPage />}
          {tab === 'cami' && <CamiPage />}
          {tab === 'access' && <AccessPage />}
        </main>
        <footer className="border-t border-[rgba(56,139,253,0.2)] py-3 text-center text-muted text-xs flex flex-col gap-1">
          <span>RAULI-VISION · Protocolo negapro.t · Full Operations · Internet curado para entornos de bajo ancho de banda</span>
          <span>Dashboard v{APP_VERSION}{health?.version ? ` · API v${health.version}` : ''}</span>
        </footer>

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
      </div>
    </ErrorBoundary>
  )
}
