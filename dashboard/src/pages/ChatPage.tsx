import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chat, chatHistory } from '../api/client'

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

export function ChatPage() {
  const [message, setMessage] = useState('')
  const [contextUrl, setContextUrl] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: history } = useQuery({
    queryKey: ['chatHistory'],
    queryFn: chatHistory,
  })

  const mutation = useMutation({
    mutationFn: () => chat(message, contextUrl || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
      setMessage('')
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, mutation.data])

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
            if (message.trim()) mutation.mutate()
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
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escriba su pregunta..."
            rows={3}
            className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none resize-none"
          />
          <button
            type="submit"
            disabled={!message.trim() || mutation.isPending}
            className="rounded-lg bg-accent/20 text-accent px-4 py-2.5 font-medium hover:bg-accent/30 disabled:opacity-50 transition"
          >
            {mutation.isPending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </section>
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur max-h-96 overflow-y-auto">
        <h3 className="text-accent font-semibold mb-3">Respuesta</h3>
        {mutation.isPending && <p className="text-muted text-sm">Trayendo información del exterior, paciencia...</p>}
        {mutation.isError && <p className="text-red-400 text-sm">Error: {(mutation.error as Error).message}</p>}
        {mutation.data && (
          <div className="space-y-2">
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
            {mutation.data.sources_used?.length ? (
              <p className="text-muted text-xs">Fuentes: {mutation.data.sources_used.join(', ')}</p>
            ) : null}
          </div>
        )}
        {history?.items?.length ? (
          <div className="mt-4 pt-4 border-t border-[rgba(56,139,253,0.2)]">
            <p className="text-muted text-xs mb-2">Historial reciente</p>
            {history.items.slice(-5).reverse().map((m) => (
              <div key={m.id} className="text-sm py-1">
                <span className={m.role === 'user' ? 'text-accent' : 'text-muted'}>{m.role}:</span> {fixMojibake(m.preview)}
              </div>
            ))}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </section>
    </div>
  )
}

