import { useState, useEffect } from 'react'

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showOfflineMessage, setShowOfflineMessage] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setShowOfflineMessage(false)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowOfflineMessage(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleDismissOfflineMessage = () => {
    setShowOfflineMessage(false)
  }

  const getSystemInfo = () => {
    if (isOnline) {
      return {
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        ),
        tooltip: 'Conectado a Internet',
        bgColor: 'bg-success'
      }
    } else {
      return {
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
        tooltip: 'Sin conexión - Sistema funcionando offline',
        bgColor: 'bg-warning animate-pulse'
      }
    }
  }

  const systemInfo = getSystemInfo()

  if (isOnline && !showOfflineMessage) {
    return null
  }

  return (
    <>
      {/* Botón de estado de red flotante */}
      <button
        className={`fixed top-20 right-6 z-40 p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 group ${systemInfo.bgColor} text-bg`}
        title={systemInfo.tooltip}
      >
        {systemInfo.icon}
        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-bg border border-[rgba(56,139,253,0.3)] text-accent px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          {systemInfo.tooltip}
        </span>
      </button>

      {/* Mensaje de notificación offline */}
      {showOfflineMessage && !isOnline && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-warning text-bg px-4 py-3 rounded-lg shadow-lg max-w-sm mx-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">⚠️ Sin conexión a Internet</p>
              <p className="text-xs opacity-90 mt-1">🔄 RAULI-VISION sigue funcionando en modo offline</p>
              <p className="text-xs opacity-80 mt-1">📱 Búsqueda local y caché activos</p>
            </div>
            <button
              onClick={handleDismissOfflineMessage}
              className="text-bg hover:bg-white/20 rounded p-1 transition"
              title="Cerrar notificación"
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
