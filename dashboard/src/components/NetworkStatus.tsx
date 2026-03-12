import { useState, useEffect, useRef, useCallback } from 'react'

type ConnState = 'connected' | 'server_down' | 'no_internet'

function getStateLabel(state: ConnState) {
  switch (state) {
    case 'connected': return 'Conectado'
    case 'server_down': return 'Servidor no disponible'
    case 'no_internet': return 'Sin internet'
  }
}

function getStateColor(state: ConnState) {
  switch (state) {
    case 'connected': return 'bg-success'
    case 'server_down': return 'bg-[#f0883e]'  // orange
    case 'no_internet': return 'bg-destructive'
  }
}

async function pingServer(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const r = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    return r.ok
  } catch {
    return false
  }
}

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [serverUp, setServerUp] = useState(true)
  const [showBanner, setShowBanner] = useState(false)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connState: ConnState = !isOnline
    ? 'no_internet'
    : !serverUp
    ? 'server_down'
    : 'connected'

  const checkServer = useCallback(async () => {
    if (!navigator.onLine) {
      setServerUp(false)
      return
    }
    const ok = await pingServer()
    setServerUp(ok)
    if (!ok) setShowBanner(true)
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      checkServer()
    }
    const handleOffline = () => {
      setIsOnline(false)
      setServerUp(false)
      setShowBanner(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial ping
    checkServer()

    // Poll every 30s
    pingRef.current = setInterval(checkServer, 30_000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (pingRef.current) clearInterval(pingRef.current)
    }
  }, [checkServer])

  // Show banner on state degradation
  useEffect(() => {
    if (connState !== 'connected') {
      setShowBanner(true)
    } else {
      // Auto-hide banner when recovered
      setShowBanner(false)
    }
  }, [connState])

  const label = getStateLabel(connState)
  const color = getStateColor(connState)

  // Show indicator dot only when degraded
  const showDot = connState !== 'connected'

  return (
    <>
      {/* Floating status button — only visible when degraded */}
      {showDot && (
        <button
          className={`fixed top-20 right-6 z-40 p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 group ${color} text-bg`}
          title={label}
        >
          {connState === 'no_internet' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          )}
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-bg border border-[rgba(56,139,253,0.3)] text-accent px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            {label}
          </span>
        </button>
      )}

      {/* Banner notification */}
      {showBanner && connState !== 'connected' && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg max-w-sm mx-4 ${
          connState === 'no_internet' ? 'bg-destructive text-bg' : 'bg-[#f0883e] text-bg'
        }`}>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs opacity-90 mt-0.5">
                {connState === 'no_internet'
                  ? 'RAULI-VISION sigue funcionando en modo offline'
                  : 'El servidor API no responde. Algunas funciones no estaran disponibles.'}
              </p>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="text-bg hover:bg-white/20 rounded p-1 transition"
              title="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
