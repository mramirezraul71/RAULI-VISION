import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { processFeedback } from '../api/client'

type FeedbackType = 'error' | 'suggestion' | 'bug' | 'improvement'
type Severity = 'low' | 'medium' | 'high' | 'critical'

const MAX_DESC = 1000

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function FeedbackAI() {
  const [isOpen, setIsOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('error')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null)
  const [copiedReply, setCopiedReply] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      return processFeedback({
        type: feedbackType,
        severity,
        title: title.trim(),
        description: description.trim(),
        screenshot: screenshotBase64 ?? undefined,
        systemInfo: {
          browser: navigator.userAgent,
          os: navigator.platform,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          connection: (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? 'unknown',
        },
      })
    },
    onSuccess: () => {
      setRateLimited(true)
      setTimeout(() => setRateLimited(false), 10_000)
      // Auto-close only on success after 4s
      setTimeout(() => {
        handleClose()
      }, 4_000)
    },
  })

  const handleClose = () => {
    setIsOpen(false)
    setTitle('')
    setDescription('')
    setFeedbackType('error')
    setSeverity('medium')
    setScreenshotPreview(null)
    setScreenshotBase64(null)
    mutation.reset()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setScreenshotPreview(null)
      setScreenshotBase64(null)
      return
    }
    setScreenshotPreview(URL.createObjectURL(file))
    try {
      const b64 = await readFileAsBase64(file)
      setScreenshotBase64(b64)
    } catch {
      setScreenshotBase64(null)
    }
  }

  const handleSubmit = () => {
    if (!title.trim() || !description.trim() || mutation.isPending || rateLimited) return
    mutation.mutate()
  }

  const handleCopyAnalysis = () => {
    if (!mutation.data?.analysis) return
    navigator.clipboard?.writeText(mutation.data.analysis).then(() => {
      setCopiedReply(true)
      setTimeout(() => setCopiedReply(false), 2000)
    })
  }

  const isSubmitDisabled = !title.trim() || !description.trim() || mutation.isPending || rateLimited

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 left-6 z-40 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white p-3 rounded-full shadow-lg shadow-purple-500/20 transition-all duration-200 hover:scale-110 group"
        title="Feedback AI - Conectado a ATLAS"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-bg border border-purple-500/30 text-purple-400 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Feedback AI - Analisis automatico
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[rgba(22,27,34,0.95)] border border-[rgba(56,139,253,0.3)] rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-accent flex items-center gap-2">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Feedback AI
              </h2>
              <button onClick={handleClose} className="text-muted hover:text-[#e6edf3] transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Success result card */}
            {mutation.isSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-emerald-300 font-medium">Feedback procesado por ATLAS</p>
                </div>
                {mutation.data?.analysis && (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-[#e6edf3]">{mutation.data.analysis}</p>
                    {mutation.data.estimated_fix_time && (
                      <p className="text-xs text-muted">Tiempo estimado: <span className="text-accent">{mutation.data.estimated_fix_time}</span></p>
                    )}
                    {mutation.data.auto_fix !== undefined && (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${mutation.data.auto_fix ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {mutation.data.auto_fix ? 'Autocorrección aplicada' : 'Revisión manual requerida'}
                      </span>
                    )}
                    <button
                      onClick={handleCopyAnalysis}
                      className="block text-xs text-muted hover:text-accent transition mt-1"
                    >
                      {copiedReply ? 'Copiado!' : 'Copiar analisis'}
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted mt-2">Esta ventana se cerrara automaticamente...</p>
              </div>
            )}

            {/* Error message — persistent, no auto-close */}
            {mutation.isError && (
              <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div>
                    <p className="text-red-300 font-medium text-sm">Error al enviar feedback</p>
                    <p className="text-red-200 text-xs mt-1">{(mutation.error as Error).message}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-[#e6edf3] mb-2">Tipo de Feedback</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    { value: 'error', label: 'Error', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                    { value: 'bug', label: 'Bug', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
                    { value: 'suggestion', label: 'Sugerencia', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
                    { value: 'improvement', label: 'Mejora', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
                  ] as { value: FeedbackType; label: string; color: string }[]).map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFeedbackType(type.value)}
                      className={`px-3 py-2 rounded-lg border text-sm transition ${feedbackType === type.value ? type.color : 'border-[rgba(56,139,253,0.3)] text-muted hover:border-accent/50'}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-[#e6edf3] mb-2">Severidad</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none text-[#e6edf3]"
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Critica</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[#e6edf3] mb-2">Titulo</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Describe el problema o sugerencia..."
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none text-[#e6edf3] placeholder-muted"
                />
              </div>

              {/* Description with char counter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#e6edf3]">Descripcion detallada</label>
                  <span className={`text-xs ${description.length > MAX_DESC * 0.9 ? 'text-warning' : 'text-muted'}`}>
                    {description.length}/{MAX_DESC}
                  </span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                  placeholder="Describe en detalle lo que ocurrio o tu sugerencia..."
                  rows={4}
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none text-[#e6edf3] placeholder-muted resize-none"
                />
              </div>

              {/* Screenshot */}
              <div>
                <label className="block text-sm font-medium text-[#e6edf3] mb-2">Captura de pantalla (opcional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none text-muted text-sm"
                />
                {screenshotPreview && (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={screenshotPreview}
                      alt="Preview"
                      className="max-h-32 rounded-lg border border-[rgba(56,139,253,0.3)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshotPreview(null)
                        setScreenshotBase64(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-muted hover:text-red-400 transition"
                      title="Quitar imagen"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {mutation.isPending && (
                <div className="bg-[rgba(56,139,253,0.1)] rounded-lg p-4 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-accent text-sm">Analizando con ATLAS...</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 border border-[rgba(56,139,253,0.3)] rounded-lg text-muted hover:border-accent/50 hover:text-[#e6edf3] transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {mutation.isPending
                    ? 'Procesando...'
                    : rateLimited
                    ? 'Enviado (espere...)'
                    : 'Enviar a IA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
