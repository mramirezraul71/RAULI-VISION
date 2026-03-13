import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chat, chatHistory, synthesizeSpeech, getVoiceEnabled, setVoiceEnabled } from '../api/client'

function fixMojibake(value?: string | null) {
  const raw = String(value || '')
  if (!/[ÃÂâ]/.test(raw)) return raw
  try {
    const repaired = decodeURIComponent(escape(raw))
    if (repaired && repaired !== raw) return repaired
  } catch {}
  return raw
}

function runtimeLabel(value?: string | null) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'IA'
  if (raw === 'clawd_cli') return 'Claude Sub'
  if (raw === 'local_auto') return 'Local Auto'
  if (raw === 'bedrock') return 'Bedrock'
  if (raw === 'openai') return 'OpenAI'
  if (raw === 'offline') return 'Offline'
  return raw
}

type HistoryItem = { id: string; role: string; preview: string; ts: string }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-muted hover:text-accent transition px-2 py-1 rounded border border-[rgba(56,139,253,0.2)] hover:border-accent/40"
      title="Copiar respuesta"
    >
      {copied ? 'Copiado!' : 'Copiar respuesta'}
    </button>
  )
}

export function ChatPage() {
  const [message, setMessage] = useState('')
  const [contextUrl, setContextUrl] = useState('')
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [expandedSources, setExpandedSources] = useState(false)
  const [voiceEnabled, setVoiceEnabledState] = useState(() => getVoiceEnabled())
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const toggleVoice = useCallback(() => {
    const next = !voiceEnabled
    setVoiceEnabledState(next)
    setVoiceEnabled(next)
    if (!next && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsSpeaking(false)
    }
  }, [voiceEnabled])

  const speakReply = useCallback(async (text: string) => {
    if (!getVoiceEnabled()) return
    // Detener cualquier reproducción anterior
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsSpeaking(true)
    const blob = await synthesizeSpeech(text)
    if (!blob || !getVoiceEnabled()) { setIsSpeaking(false); return }
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url) }
    audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url) }
    audio.play().catch(() => setIsSpeaking(false))
  }, [])

  const { data: history } = useQuery({
    queryKey: ['chatHistory'],
    queryFn: chatHistory,
  })

  const mutation = useMutation({
    mutationFn: () => chat(message, contextUrl || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
      setMessage('')
      setExpandedSources(false)
      // Leer la respuesta con Gemini TTS automáticamente
      if (data?.reply) {
        speakReply(data.reply)
      }
    },
  })

  const handleSubmit = useCallback(() => {
    if (message.trim() && !mutation.isPending) {
      mutation.mutate()
    }
  }, [message, mutation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, mutation.data])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleDeleteHistory = async (id: string) => {
    // Optimistically remove from UI
    setDeletedIds((prev) => new Set([...prev, id]))
    // Attempt DELETE call — silently ignore if endpoint doesn't exist
    try {
      await fetch(`/api/chat/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {
      // ignore
    }
    queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
  }

  const handleLoadContext = (item: HistoryItem) => {
    if (item.role === 'user') {
      setMessage(item.preview)
      textareaRef.current?.focus()
    }
  }

  const visibleHistory = (history?.items ?? []).filter((m) => !deletedIds.has(m.id))

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <h2 className="text-accent font-semibold mb-3">IA - Resumir el internet</h2>
        <p className="text-muted text-sm mb-4">
          Escriba una pregunta o pida resumir una URL. El servidor obtiene el contenido y devuelve solo la respuesta en texto plano.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="space-y-3"
        >
          <input
            type="url"
            value={contextUrl}
            onChange={(e) => setContextUrl(e.target.value)}
            placeholder="URL a resumir (opcional)"
            className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
          />
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escriba su pregunta..."
              rows={3}
              className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none resize-none"
            />
            <span className="absolute bottom-2 right-3 text-xs text-muted pointer-events-none">
              Ctrl+Enter para enviar
            </span>
          </div>
          <button
            type="submit"
            disabled={!message.trim() || mutation.isPending}
            className="rounded-lg bg-accent/20 text-accent px-4 py-2.5 font-medium hover:bg-accent/30 disabled:opacity-50 transition"
          >
            {mutation.isPending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur max-h-[600px] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-accent font-semibold">Respuesta</h3>
          <button
            type="button"
            onClick={toggleVoice}
            title={voiceEnabled ? 'Desactivar voz' : 'Activar voz'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
              voiceEnabled
                ? 'border-[rgba(56,139,253,0.4)] bg-[rgba(56,139,253,0.12)] text-accent'
                : 'border-white/10 bg-transparent text-muted'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              {voiceEnabled ? (
                <>
                  <path d="M15.54 8.46a5 5 0 010 7.07"/>
                  <path d="M19.07 4.93a10 10 0 010 14.14"/>
                </>
              ) : (
                <line x1="23" y1="9" x2="17" y2="15"/>
              )}
            </svg>
            {isSpeaking ? 'Reproduciendo...' : voiceEnabled ? 'Voz activa' : 'Voz desactivada'}
          </button>
        </div>
        {mutation.isPending && <p className="text-muted text-sm">Trayendo información del exterior, paciencia...</p>}
        {mutation.isError && <p className="text-red-400 text-sm">Error: {(mutation.error as Error).message}</p>}
        {mutation.data && (
          <div className="space-y-3">
            {mutation.data.runtime ? (
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[rgba(56,139,253,0.3)] bg-[rgba(56,139,253,0.12)] px-3 py-1 text-[11px] text-accent">
                  {runtimeLabel(mutation.data.runtime.family)}
                </span>
                {mutation.data.runtime.model ? (
                  <span className="rounded-full border border-white/10 bg-[#0d1117] px-3 py-1 text-[11px] text-[#e6edf3]">
                    {mutation.data.runtime.model}
                  </span>
                ) : null}
                {mutation.data.runtime.route ? (
                  <span className="rounded-full border border-white/10 bg-[#0d1117] px-3 py-1 text-[11px] text-[#e6edf3]">
                    Ruta {mutation.data.runtime.route}
                  </span>
                ) : null}
                {mutation.data.runtime.latency_ms ? (
                  <span className="rounded-full border border-white/10 bg-[#0d1117] px-3 py-1 text-[11px] text-[#e6edf3]">
                    {Math.round(mutation.data.runtime.latency_ms)}ms
                  </span>
                ) : null}
                {mutation.data.runtime.offline ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
                    Offline
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="text-[#e6edf3] whitespace-pre-wrap">{fixMojibake(mutation.data.reply)}</p>

            {/* Copy button for AI response */}
            <div className="flex items-center gap-3">
              <CopyButton text={fixMojibake(mutation.data.reply)} />
            </div>

            {/* Sources as expandable list */}
            {mutation.data.sources_used?.length ? (
              <div>
                <button
                  type="button"
                  onClick={() => setExpandedSources((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted hover:text-accent transition"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${expandedSources ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {mutation.data.sources_used.length} fuente{mutation.data.sources_used.length !== 1 ? 's' : ''} utilizadas
                </button>
                {expandedSources && (
                  <ul className="mt-2 space-y-1 pl-4">
                    {mutation.data.sources_used.map((src, i) => (
                      <li key={i} className="text-xs">
                        {src.startsWith('http') ? (
                          <a
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline break-all"
                          >
                            {src}
                          </a>
                        ) : (
                          <span className="text-muted">{src}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        )}

        {visibleHistory.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[rgba(56,139,253,0.2)]">
            <p className="text-muted text-xs mb-2">Historial reciente</p>
            <div className="space-y-1">
              {visibleHistory.slice(-10).reverse().map((m) => (
                <div
                  key={m.id}
                  className="group flex items-center gap-2 text-sm py-1 rounded px-1 hover:bg-[rgba(56,139,253,0.05)] transition"
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => handleLoadContext(m)}
                    title={m.role === 'user' ? 'Cargar este mensaje' : undefined}
                  >
                    <span className={m.role === 'user' ? 'text-accent' : 'text-muted'}>{m.role}:</span>{' '}
                    <span className="text-[#e6edf3]">{fixMojibake(m.preview)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteHistory(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition p-1 rounded"
                    title="Eliminar del historial"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </section>
    </div>
  )
}
