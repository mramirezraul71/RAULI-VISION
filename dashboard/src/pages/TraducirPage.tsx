import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { traducirPairs, traducir } from '../api/client'

const MAX_CHARS = 500

export function TraducirPage() {
  const [text, setText] = useState('')
  const [langPair, setLangPair] = useState('es|en')
  const [copied, setCopied] = useState(false)

  const { data: pairsData } = useQuery({
    queryKey: ['traducirPairs'],
    queryFn: traducirPairs,
    staleTime: Infinity,
  })

  const mutation = useMutation({
    mutationFn: () => traducir(text.trim(), langPair),
  })

  const handleSwap = () => {
    const parts = langPair.split('|')
    if (parts.length === 2) setLangPair(`${parts[1]}|${parts[0]}`)
  }

  const handleCopy = () => {
    if (!mutation.data?.translated_text) return
    navigator.clipboard.writeText(mutation.data.translated_text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const charCount = [...text].length
  const overLimit = charCount > MAX_CHARS

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#e6edf3]">Traducir</h2>
        <p className="text-muted text-sm mt-0.5">Traducción de texto · MyMemory API</p>
      </div>

      {/* Selector de idioma */}
      <div className="flex items-center gap-2">
        <select
          value={langPair}
          onChange={e => setLangPair(e.target.value)}
          className="flex-1 bg-[rgba(22,27,34,0.8)] border border-[rgba(56,139,253,0.3)] text-[#e6edf3] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/70"
        >
          {(pairsData?.pairs ?? []).map(p => (
            <option key={p.code} value={p.code}>{p.label}</option>
          ))}
        </select>
        <button
          onClick={handleSwap}
          className="px-3 py-2 bg-[rgba(56,139,253,0.1)] hover:bg-accent/20 border border-[rgba(56,139,253,0.3)] rounded-lg text-accent text-sm transition"
          title="Invertir idiomas"
        >
          ⇄
        </button>
      </div>

      {/* Área de entrada */}
      <div className="space-y-1">
        <div className="relative">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe el texto a traducir…"
            rows={6}
            className={`w-full bg-[rgba(22,27,34,0.8)] border rounded-lg px-4 py-3 text-sm text-[#e6edf3] placeholder-muted/50 focus:outline-none resize-none ${overLimit ? 'border-red-500/60' : 'border-[rgba(56,139,253,0.3)] focus:border-accent/70'}`}
          />
          <span className={`absolute bottom-3 right-3 text-xs ${overLimit ? 'text-red-400' : 'text-muted/50'}`}>
            {charCount}/{MAX_CHARS}
          </span>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !text.trim() || overLimit}
          className="w-full py-2.5 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Traduciendo…
            </>
          ) : '🌐 Traducir'}
        </button>
      </div>

      {/* Error */}
      {mutation.isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {String(mutation.error)}
        </div>
      )}

      {/* Resultado */}
      {mutation.data && (
        <div className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.8)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(56,139,253,0.15)]">
            <span className="text-xs text-muted font-medium uppercase tracking-wide">Traducción</span>
            <div className="flex items-center gap-2">
              {/* Calidad */}
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                mutation.data.match_quality >= 70
                  ? 'text-green-400 border-green-500/40 bg-green-500/10'
                  : mutation.data.match_quality >= 40
                  ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'
                  : 'text-red-400 border-red-500/40 bg-red-500/10'
              }`}>
                {Math.round(mutation.data.match_quality)}% calidad
              </span>
              <button
                onClick={handleCopy}
                className="text-xs px-2.5 py-1 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent hover:border-accent/50 transition"
              >
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
          <div className="px-4 py-4 text-sm text-[#e6edf3] leading-relaxed select-text">
            {mutation.data.translated_text}
          </div>
          <div className="px-4 py-2 border-t border-[rgba(56,139,253,0.1)] text-xs text-muted/50">
            {mutation.data.lang_pair} · {mutation.data.source}
          </div>
        </div>
      )}

      <div className="text-center text-muted text-xs pt-1 border-t border-[rgba(56,139,253,0.1)]">
        Powered by <span className="text-accent/70">MyMemory</span> · Límite: {MAX_CHARS} caracteres por consulta
      </div>
    </div>
  )
}
