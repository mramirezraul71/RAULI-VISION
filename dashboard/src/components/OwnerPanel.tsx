import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'

const STORAGE_KEY = 'rv_owner_token'
const ADMIN_STORAGE_KEY = 'rauli_admin_token'

function getStoredToken(): string {
  const ownerToken = localStorage.getItem(STORAGE_KEY)?.trim()
  if (ownerToken) return ownerToken
  return localStorage.getItem(ADMIN_STORAGE_KEY)?.trim() ?? ''
}

function persistToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token)
  localStorage.setItem(ADMIN_STORAGE_KEY, token)
}

function clearPersistedToken() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(ADMIN_STORAGE_KEY)
}

interface ActivityEvent {
  id: string
  timestamp: string
  type: string
  user_id: string
  summary: string
  details?: Record<string, unknown>
  severity?: string
}

interface TaskResponse {
  ok: boolean
  reply: string
  model: string
  duration_ms: number
}

type TokenValidation = 'ok' | 'unauthorized' | 'offline'

const TYPE_META: Record<string, { icon: string; color: string }> = {
  feedback:   { icon: '📬', color: 'text-purple-400' },
  chat:       { icon: '💬', color: 'text-blue-400' },
  search:     { icon: '🔍', color: 'text-cyan-400' },
  tiktok:     { icon: '🎬', color: 'text-pink-400' },
  radio:      { icon: '📻', color: 'text-green-400' },
  tv:         { icon: '📺', color: 'text-yellow-400' },
  owner_task: { icon: '⚡', color: 'text-accent' },
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

function EventRow({ ev }: { ev: ActivityEvent }) {
  const meta = TYPE_META[ev.type] ?? { icon: '•', color: 'text-muted' }
  const severityDot = ev.severity === 'critical' ? 'bg-red-500' :
                      ev.severity === 'high'     ? 'bg-orange-400' : null
  return (
    <div className="flex items-start gap-2 py-2 px-3 border-b border-[rgba(56,139,253,0.08)] hover:bg-[rgba(56,139,253,0.04)] transition-colors">
      <span className="text-base mt-0.5 flex-shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {severityDot && <span className={`w-1.5 h-1.5 rounded-full ${severityDot} flex-shrink-0`} />}
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>{ev.type}</span>
          <span className="text-muted/50 text-[10px]">·</span>
          <span className="text-[10px] text-muted/70 font-mono">{ev.user_id}</span>
          <span className="text-muted/40 text-[10px] ml-auto flex-shrink-0">{fmtTime(ev.timestamp)}</span>
        </div>
        <p className="text-xs text-[#c9d1d9] mt-0.5 leading-snug truncate">{ev.summary}</p>
      </div>
    </div>
  )
}

export function OwnerPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'monitor' | 'tasks'>('monitor')
  const [token, setToken] = useState(() => getStoredToken())
  const [tokenInput, setTokenInput] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'unauthorized'>('disconnected')
  const [taskInput, setTaskInput] = useState('')
  const [taskHistory, setTaskHistory] = useState<{ role: 'owner' | 'ai'; text: string; ms?: number }[]>([])
  const eventsEndRef = useRef<HTMLDivElement>(null)
  const tasksEndRef = useRef<HTMLDivElement>(null)
  const sseRef = useRef<EventSource | null>(null)

  const validateToken = useCallback(async (tokenToCheck: string): Promise<TokenValidation> => {
    try {
      const check = await fetch(`/owner/recent?token=${encodeURIComponent(tokenToCheck)}`, { cache: 'no-store' })
      if (check.status === 401) return 'unauthorized'
      return check.ok ? 'ok' : 'offline'
    } catch {
      return 'offline'
    }
  }, [])

  // Verificar token persistido al iniciar
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      if (!token) {
        setAuthenticated(false)
        return
      }
      const result = await validateToken(token)
      if (cancelled) return
      if (result === 'ok') {
        setAuthenticated(true)
        setAuthError(null)
      } else if (result === 'unauthorized') {
        setAuthenticated(false)
        setToken('')
        clearPersistedToken()
      } else {
        // Mantener sesión local mientras no haya conexión; se revalida al reconectar.
        setAuthenticated(true)
        setSseStatus('disconnected')
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [token, validateToken])

  const connectSSE = useCallback(async () => {
    if (!token || !open || tab !== 'monitor') return
    if (sseRef.current) sseRef.current.close()
    setSseStatus('connecting')

    // Validar token — ruta /owner/* va directamente a espejo-backend (sin proxy-backend)
    // Vercel reescribe /owner/:path* → espejo-backend.onrender.com/api/owner/:path*
    try {
      const check = await validateToken(token)
      if (check === 'unauthorized') {
        setSseStatus('unauthorized')
        setAuthError('Token invalido para Panel Owner')
        return
      }
      if (check === 'offline') {
        setSseStatus('disconnected')
        setAuthError('Sin conexion para validar token Owner')
        return
      }
    } catch {
      setSseStatus('disconnected')
      return
    }

    const es = new EventSource(`/owner/activity?token=${encodeURIComponent(token)}`)
    sseRef.current = es
    es.addEventListener('activity', (e) => {
      try {
        const ev: ActivityEvent = JSON.parse(e.data)
        setEvents(prev => {
          const next = [...prev, ev]
          return next.length > 100 ? next.slice(-100) : next
        })
      } catch { /* ignorar */ }
    })
    es.onopen = () => setSseStatus('connected')
    es.onerror = () => {
      setSseStatus('disconnected')
      es.close()
      // Reconectar tras 8s (solo si token sigue siendo válido)
      setTimeout(connectSSE, 8000)
    }
  }, [token, open, tab, validateToken])

  useEffect(() => {
    if (authenticated && open && tab === 'monitor') {
      connectSSE()
    }
    return () => {
      if (tab !== 'monitor') {
        sseRef.current?.close()
        setSseStatus('disconnected')
      }
    }
  }, [authenticated, open, tab, connectSSE])

  // Auto-scroll en monitor
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  // Auto-scroll en tareas
  useEffect(() => {
    tasksEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskHistory])

  // Cerrar SSE al desmontar
  useEffect(() => () => { sseRef.current?.close() }, [])

  const taskMutation = useMutation({
    mutationFn: async (task: string): Promise<TaskResponse> => {
      const r = await fetch('/owner/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ task }),
      })
      if (!r.ok) throw new Error('Error enviando tarea')
      return r.json()
    },
    onSuccess: (data) => {
      setTaskHistory(prev => [...prev, {
        role: 'ai',
        text: data.reply,
        ms: data.duration_ms,
      }])
    },
    onError: () => {
      setTaskHistory(prev => [...prev, { role: 'ai', text: 'Error — Gemini no disponible.' }])
    },
  })

  const handleLogin = async () => {
    const nextToken = tokenInput.trim()
    if (!nextToken || loggingIn) return
    setLoggingIn(true)
    setAuthError(null)
    const result = await validateToken(nextToken)
    if (result === 'ok') {
      setToken(nextToken)
      persistToken(nextToken)
      setAuthenticated(true)
      setSseStatus('disconnected')
      setTokenInput('')
    } else if (result === 'unauthorized') {
      setAuthenticated(false)
      setAuthError('Token invalido. Revisa ADMIN_TOKEN en espejo-backend.')
    } else {
      setAuthenticated(false)
      setAuthError('Sin conexion. No se pudo validar el token Owner.')
    }
    setLoggingIn(false)
  }

  const handleLogout = () => {
    setToken('')
    setAuthenticated(false)
    setAuthError(null)
    setSseStatus('disconnected')
    clearPersistedToken()
    sseRef.current?.close()
    setEvents([])
    setTaskHistory([])
  }

  const handleSendTask = () => {
    const t = taskInput.trim()
    if (!t || taskMutation.isPending) return
    setTaskHistory(prev => [...prev, { role: 'owner', text: t }])
    setTaskInput('')
    taskMutation.mutate(t)
  }

  return (
    <>
      {/* Botón de acceso — esquina inferior derecha, encima del FeedbackAI */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-20 right-6 z-40 w-11 h-11 rounded-full border flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 ${
          authenticated
            ? 'bg-gradient-to-br from-[#1a2a1a] to-[#0d1a0d] border-emerald-500/50 shadow-emerald-500/20'
            : 'bg-[rgba(22,27,34,0.9)] border-[rgba(56,139,253,0.4)] shadow-black/30'
        }`}
        title="Panel Owner"
      >
        <svg className={`w-5 h-5 ${authenticated ? 'text-emerald-400' : 'text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </button>

      {/* Panel flotante */}
      {open && (
        <div
          className="fixed bottom-36 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-[rgba(13,17,23,0.98)] border border-[rgba(56,139,253,0.25)] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          style={{ maxHeight: '70vh', animation: 'slideUpFade 0.18s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(56,139,253,0.2)] bg-[rgba(22,27,34,0.8)]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-sm font-semibold text-[#e6edf3]">Panel Owner</span>
              {authenticated && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  sseStatus === 'connected'      ? 'bg-emerald-500/20 text-emerald-400' :
                  sseStatus === 'connecting'     ? 'bg-yellow-500/20 text-yellow-400' :
                  sseStatus === 'unauthorized'   ? 'bg-orange-500/20 text-orange-400' :
                                                   'bg-red-500/20 text-red-400'
                }`}>
                  {sseStatus === 'connected'    ? '● EN VIVO'
                  : sseStatus === 'connecting'  ? '◌ Conectando'
                  : sseStatus === 'unauthorized'? '⚠ Token inválido'
                  :                              '○ Offline'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {authenticated && (
                <button onClick={handleLogout} className="text-[10px] text-muted/60 hover:text-red-400 transition px-1.5 py-0.5 rounded">
                  Salir
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted hover:text-[#e6edf3] transition p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {!authenticated ? (
            /* ── Login ── */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
              <div className="w-12 h-12 rounded-full bg-[rgba(56,139,253,0.1)] border border-[rgba(56,139,253,0.3)] flex items-center justify-center">
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#e6edf3]">Acceso Owner</p>
                <p className="text-xs text-muted/60 mt-0.5">Introduce tu token de administración</p>
              </div>
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleLogin()}
                placeholder="Token de administración..."
                className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg text-sm text-[#e6edf3] placeholder-muted/40 focus:outline-none focus:border-accent/60"
                autoFocus
              />
              {authError && (
                <p className="text-[11px] text-orange-400 text-center">{authError}</p>
              )}
              <button
                onClick={() => void handleLogin()}
                disabled={!tokenInput.trim() || loggingIn}
                className="w-full py-2 bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {loggingIn ? 'Validando...' : 'Entrar'}
              </button>
            </div>
          ) : (
            <>
              {/* ── Tabs ── */}
              <div className="flex border-b border-[rgba(56,139,253,0.15)]">
                {(['monitor', 'tasks'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-medium transition ${
                      tab === t
                        ? 'text-accent border-b-2 border-accent -mb-px'
                        : 'text-muted/70 hover:text-[#e6edf3]'
                    }`}
                  >
                    {t === 'monitor' ? `👁 Monitor (${events.length})` : '⚡ Tareas IA'}
                  </button>
                ))}
              </div>

              {tab === 'monitor' ? (
                /* ── Monitor de actividad ── */
                <div className="flex-1 overflow-y-auto min-h-0">
                  {sseStatus === 'unauthorized' ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
                      <span className="text-2xl">🔑</span>
                      <p className="text-xs text-orange-400 font-medium">Token de administración incorrecto</p>
                      <p className="text-[10px] text-muted/60 leading-relaxed">
                        Ve al Dashboard de Render → espejo-backend → Environment → copia el valor de <span className="font-mono text-orange-300">ADMIN_TOKEN</span>
                      </p>
                      <button
                        onClick={handleLogout}
                        className="text-[10px] px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-500/20 transition"
                      >
                        Cambiar token
                      </button>
                    </div>
                  ) : events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted/40">
                      <span className="text-2xl mb-2">📡</span>
                      <p className="text-xs">Esperando actividad de usuarios...</p>
                    </div>
                  ) : (
                    <>
                      {[...events].reverse().map(ev => (
                        <EventRow key={ev.id} ev={ev} />
                      ))}
                      <div ref={eventsEndRef} />
                    </>
                  )}
                </div>
              ) : (
                /* ── Canal de tareas ── */
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {taskHistory.length === 0 && (
                      <div className="text-center py-6 text-muted/40">
                        <span className="text-xl block mb-1">⚡</span>
                        <p className="text-xs">Escribe una tarea para Gemini</p>
                      </div>
                    )}
                    {taskHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'owner' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === 'owner'
                            ? 'bg-accent/20 text-accent border border-accent/30'
                            : 'bg-[rgba(22,27,34,0.8)] text-[#c9d1d9] border border-[rgba(56,139,253,0.15)]'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {msg.ms && (
                            <p className="text-[9px] text-muted/40 mt-1 text-right">{msg.ms}ms · Gemini</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {taskMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-[rgba(22,27,34,0.8)] border border-[rgba(56,139,253,0.15)] rounded-xl px-3 py-2">
                          <span className="flex gap-1">
                            {[0,1,2].map(i => (
                              <span key={i} className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                            ))}
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={tasksEndRef} />
                  </div>
                  {/* Input */}
                  <div className="border-t border-[rgba(56,139,253,0.15)] p-3 flex gap-2">
                    <textarea
                      value={taskInput}
                      onChange={e => setTaskInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTask() }
                      }}
                      placeholder="Escribe una tarea para Gemini... (Enter para enviar)"
                      rows={2}
                      className="flex-1 px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg text-xs text-[#e6edf3] placeholder-muted/40 focus:outline-none focus:border-accent/60 resize-none"
                    />
                    <button
                      onClick={handleSendTask}
                      disabled={!taskInput.trim() || taskMutation.isPending}
                      className="px-3 py-2 bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent rounded-lg transition disabled:opacity-50 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
