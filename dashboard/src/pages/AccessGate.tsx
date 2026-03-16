import { useState } from 'react'
import { createAccessRequest, validateAccessCode } from '../api/client'

const USER_TOKEN_KEY = 'rauli_user_token'

interface Props {
  onAuthenticated: (code: string) => void
}

export function AccessGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'code' | 'request'>('code')

  // Modo: ingresar código
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)

  // Modo: solicitar acceso
  const [form, setForm] = useState({ name: '', email: '', role: '', message: '' })
  const [requestSent, setRequestSent] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { setCodeError('Ingresa tu código de acceso'); return }
    setCodeLoading(true)
    setCodeError('')
    const valid = await validateAccessCode(trimmed)
    setCodeLoading(false)
    if (!valid) {
      setCodeError('Código incorrecto o no autorizado. Solicita acceso al administrador.')
      return
    }
    localStorage.setItem(USER_TOKEN_KEY, trimmed)
    onAuthenticated(trimmed)
  }

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRequestLoading(true)
    setRequestError('')
    try {
      await createAccessRequest({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role.trim(),
        message: form.message.trim(),
      })
      setRequestSent(true)
    } catch (err) {
      setRequestError((err as Error).message || 'Error al enviar la solicitud')
    } finally {
      setRequestLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-[#e6edf3] flex flex-col items-center justify-center px-4 py-8">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-accent tracking-tight">RAULI-VISION</h1>
        <p className="text-muted text-sm mt-2">Protocolo negapro.t · Internet curado · Acceso restringido</p>
      </div>

      <div className="w-full max-w-md">
        {/* Tabs */}
        <div className="flex mb-6 rounded-xl border border-[rgba(56,139,253,0.3)] overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              mode === 'code'
                ? 'bg-accent/20 text-accent'
                : 'text-muted hover:text-[#e6edf3]'
            }`}
          >
            🔑 Tengo un código
          </button>
          <button
            type="button"
            onClick={() => setMode('request')}
            className={`flex-1 py-3 text-sm font-medium transition border-l border-[rgba(56,139,253,0.3)] ${
              mode === 'request'
                ? 'bg-accent/20 text-accent'
                : 'text-muted hover:text-[#e6edf3]'
            }`}
          >
            📝 Solicitar acceso
          </button>
        </div>

        {/* Panel: ingresar código */}
        {mode === 'code' && (
          <div className="rounded-2xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.9)] p-6">
            <h2 className="text-lg font-semibold text-accent mb-1">Ingresa tu código de acceso</h2>
            <p className="text-sm text-muted mb-5">
              Tu código de acceso personalizado te fue enviado por el administrador.
              También puedes abrir tu enlace personalizado directamente.
            </p>
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Ej: LISI2026BB"
                autoFocus
                className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-3 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none font-mono tracking-widest uppercase"
              />
              {codeError && (
                <p className="text-sm text-red-400">{codeError}</p>
              )}
              <button
                type="submit"
                disabled={codeLoading}
                className="w-full rounded-lg bg-accent/20 text-accent px-4 py-3 font-medium hover:bg-accent/30 transition disabled:opacity-50"
              >
                {codeLoading ? 'Verificando…' : 'Acceder'}
              </button>
            </form>
            <p className="text-xs text-muted/60 mt-4 text-center">
              ¿No tienes código? Solicita acceso al administrador usando la pestaña de la izquierda.
            </p>
          </div>
        )}

        {/* Panel: solicitar acceso */}
        {mode === 'request' && (
          <div className="rounded-2xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.9)] p-6">
            <h2 className="text-lg font-semibold text-accent mb-1">Solicitar acceso</h2>
            <p className="text-sm text-muted mb-5">
              Completa el formulario. El administrador revisará tu solicitud y te enviará tu código de acceso.
            </p>

            {requestSent ? (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm text-center">
                <p className="text-success font-semibold text-base mb-1">✓ Solicitud enviada</p>
                <p className="text-muted">El administrador revisará tu petición y te enviará el enlace de acceso personalizado.</p>
              </div>
            ) : (
              <form onSubmit={handleRequestSubmit} className="space-y-3">
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre completo *"
                  className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Correo electrónico *"
                  className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                />
                <input
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Rol o cargo (opcional)"
                  className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                />
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="¿Por qué necesitas acceso? (opcional)"
                  rows={3}
                  className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none resize-none"
                />
                {requestError && (
                  <p className="text-sm text-red-400">{requestError}</p>
                )}
                <button
                  type="submit"
                  disabled={requestLoading}
                  className="w-full rounded-lg bg-accent/20 text-accent px-4 py-3 font-medium hover:bg-accent/30 transition disabled:opacity-50"
                >
                  {requestLoading ? 'Enviando…' : 'Enviar solicitud'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-muted/40 text-center">
        RAULI-VISION · Acceso restringido a usuarios autorizados
      </p>
    </div>
  )
}
