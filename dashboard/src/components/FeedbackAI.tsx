import { useState, useRef } from 'react'

interface FeedbackData {
  id: string
  type: 'error' | 'suggestion' | 'bug' | 'improvement'
  category: string
  title: string
  description: string
  url: string
  userAgent: string
  timestamp: string
  userId?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  screenshots?: string[]
  logs?: string
  systemInfo?: {
    browser: string
    os: string
    memory: string
    connection: string
  }
}

interface AIAnalysis {
  detectedIssue: string
  rootCause: string
  recommendedAction: string
  autoFix: boolean
  codeChanges?: {
    file: string
    line: number
    oldCode: string
    newCode: string
  }[]
  priority: number
  estimatedTime: string
}

interface FeedbackBrainResponse {
  success: boolean
  message?: string
  analysis?: AIAnalysis
  decision?: string
  status?: string
  approvalId?: string
  atlasReply?: string
  timestamp?: string
}

export function FeedbackAI() {
  const [isOpen, setIsOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<'error' | 'suggestion' | 'bug' | 'improvement'>('error')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [atlasMessage, setAtlasMessage] = useState('')
  const [decision, setDecision] = useState('')
  const [decisionStatus, setDecisionStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const collectSystemInfo = () => {
    return {
      browser: navigator.userAgent,
      os: navigator.platform,
      memory: `${(performance as any).memory?.usedJSHeapSize || 0} bytes`,
      connection: (navigator as any).connection?.effectiveType || 'unknown',
      url: window.location.href,
      timestamp: new Date().toISOString()
    }
  }

  const sendToMyBrain = async (feedback: FeedbackData): Promise<FeedbackBrainResponse> => {
    const brainData = {
      source: 'RAULI-VISION Feedback AI',
      feedback,
      analysis: {},
      timestamp: new Date().toISOString(),
      action: 'ANALYZE_AND_FIX',
      autoCorrection: true
    }

    const resp = await fetch('/api/feedback/brain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainData)
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || data?.success === false) {
      throw new Error(data?.message || `Feedback API error (${resp.status})`)
    }
    return data as FeedbackBrainResponse
  }

  const resetModal = () => {
    setSubmitted(false)
    setIsOpen(false)
    setTitle('')
    setDescription('')
    setAnalysis(null)
    setAtlasMessage('')
    setDecision('')
    setDecisionStatus('')
  }

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return

    setIsSubmitting(true)
    setIsAnalyzing(true)

    const feedbackData: FeedbackData = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: feedbackType,
      category: feedbackType,
      title: title.trim(),
      description: description.trim(),
      userAgent: navigator.userAgent,
      ...collectSystemInfo(),
      severity,
      screenshots: fileInputRef.current?.files ? Array.from(fileInputRef.current.files).map((f) => URL.createObjectURL(f)) : []
    }

    try {
      const result = await sendToMyBrain(feedbackData)
      setAnalysis(result.analysis || null)
      setAtlasMessage(result.atlasReply || result.message || 'Feedback procesado por ATLAS.')
      setDecision(result.decision || '')
      setDecisionStatus(result.status || '')
      setSubmitted(true)

      setTimeout(() => {
        resetModal()
      }, 6000)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error procesando feedback con ATLAS'
      setAtlasMessage(msg)
      setDecision('error')
      setDecisionStatus('failed')
      setSubmitted(true)
      setTimeout(() => {
        setSubmitted(false)
      }, 6000)
    } finally {
      setIsAnalyzing(false)
      setIsSubmitting(false)
    }
  }

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
              <h2 className="text-2xl font-bold text-accent flex items-center gap-2">
                <span className="text-3xl">🧠</span>
                Feedback AI - Analisis Automatico
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-muted hover:text-[#e6edf3] transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-xl font-semibold text-accent mb-2">Feedback Procesado por ATLAS</h3>
                <p className="text-muted mb-4">{atlasMessage || 'Analisis completado y decision registrada.'}</p>
                {analysis && (
                  <div className="bg-[rgba(56,139,253,0.1)] rounded-lg p-4 text-left">
                    <h4 className="font-medium text-accent mb-2">Analisis IA:</h4>
                    <p className="text-sm text-muted mb-1">{analysis.detectedIssue}</p>
                    <p className="text-sm text-muted mb-1">Tiempo estimado: {analysis.estimatedTime}</p>
                    <p className="text-sm text-success">Correccion automatica: {analysis.autoFix ? 'Aplicada' : 'No disponible'}</p>
                    <p className="text-sm text-muted mt-2">
                      Decision: <span className="text-accent">{decision || '--'}</span> · Estado: <span className="text-accent">{decisionStatus || '--'}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-2">Tipo de Feedback</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { value: 'error', label: '🚨 Error', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                      { value: 'bug', label: '🐛 Bug', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
                      { value: 'suggestion', label: '💡 Sugerencia', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
                      { value: 'improvement', label: '✨ Mejora', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
                    ].map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setFeedbackType(type.value as any)}
                        className={`px-3 py-2 rounded-lg border transition ${feedbackType === type.value ? type.color : 'border-[rgba(56,139,253,0.3)] text-muted hover:border-accent/50'}`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-2">Severidad</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                  >
                    <option value="low">🟢 Baja</option>
                    <option value="medium">🟡 Media</option>
                    <option value="high">🟠 Alta</option>
                    <option value="critical">🔴 Critica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-2">Titulo</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Describe el problema o sugerencia..."
                    className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-2">Descripcion detallada</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe en detalle lo que ocurrio o tu sugerencia..."
                    rows={4}
                    className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-2">Captura de pantalla (opcional)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                  />
                </div>

                {isAnalyzing && (
                  <div className="bg-[rgba(56,139,253,0.1)] rounded-lg p-4 text-center">
                    <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-accent">Analizando con ATLAS...</p>
                    <p className="text-sm text-muted">Procesando decision y autocorreccion</p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 px-4 py-2 border border-[rgba(56,139,253,0.3)] rounded-lg hover:border-accent/50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!title.trim() || !description.trim() || isSubmitting || isAnalyzing}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Procesando...' : '🧠 Enviar a IA'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
