import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAccessRequest,
  createAccessRequest,
  directCreateUser,
  listAccessRequests,
  listAccessUsers,
  rejectAccessRequest,
  type AccessRequest,
  type AccessRequestInput,
  type AccessUser,
} from '../api/client'

const ADMIN_TOKEN_KEY  = 'rauli_admin_token'
const ADMIN_NAME_KEY   = 'rauli_admin_name'
const ATLAS_API        = 'http://127.0.0.1:8791'

/** Registra el usuario aprobado en Atlas para activar el avatar personalizado via /?u=<access_code> */
async function syncUserToAtlas(name: string, accessCode: string): Promise<void> {
  try {
    await fetch(`${ATLAS_API}/api/rauli/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, token: accessCode }),
    })
  } catch { /* best-effort */ }
}

function buildPersonalizedLink(accessCode: string): string {
  return `${window.location.origin}/?u=${accessCode}`
}

const emptyRequest: AccessRequestInput = {
  name: '',
  email: '',
  role: '',
  organization: '',
  message: '',
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function relativeTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'hace un momento'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `hace ${diffHr} h`
  const diffDay = Math.floor(diffHr / 24)
  return `hace ${diffDay} d`
}

function requestStatusStyle(status: AccessRequest['status']) {
  switch (status) {
    case 'approved':
      return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
    case 'rejected':
      return 'border-red-400/40 bg-red-500/10 text-red-300'
    default:
      return 'border-amber-400/40 bg-amber-500/10 text-amber-200'
  }
}

function userStatusStyle(status: AccessUser['status']) {
  return status === 'active'
    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
    : 'border-slate-400/40 bg-slate-500/10 text-slate-200'
}

/** Considera online si el último ping fue hace menos de 2 minutos */
function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000
}

function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-emerald-200 hover:text-emerald-100 transition"
    >
      {copied ? 'Copiado!' : label}
    </button>
  )
}

export function AccessPage() {
  const queryClient = useQueryClient()
  const [requestInput, setRequestInput] = useState<AccessRequestInput>(emptyRequest)
  const [submittedRequest, setSubmittedRequest] = useState<AccessRequest | null>(null)
  const [adminToken, setAdminToken] = useState('')
  const [adminName, setAdminName] = useState('')
  const [requestFilter, setRequestFilter] = useState<'all' | AccessRequest['status']>('pending')
  const [userFilter, setUserFilter] = useState<'all' | AccessUser['status']>('active')
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [lastApproved, setLastApproved] = useState<AccessUser | null>(null)
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set())
  const [bulkPending, setBulkPending] = useState(false)

  // Creación directa de usuario (sin solicitud)
  const [directForm, setDirectForm] = useState({ name: '', email: '', role: '', organization: '', access_code: '' })
  const [lastDirectCreated, setLastDirectCreated] = useState<AccessUser | null>(null)

  useEffect(() => {
    setAdminToken(localStorage.getItem(ADMIN_TOKEN_KEY) ?? '')
    setAdminName(localStorage.getItem(ADMIN_NAME_KEY) ?? '')
  }, [])

  const adminReady = adminToken.trim().length > 0

  const requestMutation = useMutation({
    mutationFn: (input: AccessRequestInput) => createAccessRequest(input),
    onSuccess: (data) => {
      setSubmittedRequest(data.request)
      setRequestInput(emptyRequest)
    },
  })

  const { data: requestData, isFetching: requestsLoading, error: requestsError, refetch: refetchRequests } = useQuery({
    queryKey: ['accessRequests', adminToken, requestFilter],
    queryFn: () => listAccessRequests(adminToken, requestFilter === 'all' ? undefined : requestFilter),
    enabled: adminReady,
  })

  // Query separada para contadores — siempre trae todos sin filtro
  const { data: allRequestsData } = useQuery({
    queryKey: ['accessRequestsAll', adminToken],
    queryFn: () => listAccessRequests(adminToken, undefined),
    enabled: adminReady,
    refetchInterval: adminReady ? 30_000 : false,
  })

  const { data: usersData, isFetching: usersLoading, error: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['accessUsers', adminToken, userFilter],
    queryFn: () => listAccessUsers(adminToken, userFilter === 'all' ? undefined : userFilter),
    enabled: adminReady,
    refetchInterval: adminReady ? 15_000 : false,
  })

  const directCreateMutation = useMutation({
    mutationFn: () => directCreateUser(
      {
        name: directForm.name.trim(),
        email: directForm.email.trim() || undefined,
        role: directForm.role.trim() || undefined,
        organization: directForm.organization.trim() || undefined,
        access_code: directForm.access_code.trim().toUpperCase() || undefined,
      },
      adminToken,
      adminName,
    ),
    onSuccess: (data) => {
      setLastDirectCreated(data.user)
      setDirectForm({ name: '', email: '', role: '', organization: '', access_code: '' })
      if (data.user?.access_code && data.user?.name) {
        syncUserToAtlas(data.user.name, data.user.access_code)
      }
      queryClient.invalidateQueries({ queryKey: ['accessUsers'] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      approveAccessRequest(id, adminToken, { note, decidedBy: adminName }),
    onSuccess: (data) => {
      setLastApproved(data.user)
      // Sincronizar con Atlas para activar el avatar personalizado
      if (data.user?.access_code && data.user?.name) {
        syncUserToAtlas(data.user.name, data.user.access_code)
      }
      queryClient.invalidateQueries({ queryKey: ['accessRequests'] })
      queryClient.invalidateQueries({ queryKey: ['accessUsers'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      rejectAccessRequest(id, adminToken, { note, decidedBy: adminName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessRequests'] })
      queryClient.invalidateQueries({ queryKey: ['accessUsers'] })
    },
  })

  const stats = useMemo(() => {
    const items = allRequestsData?.items ?? []
    return {
      total: items.length,
      pending: items.filter((r) => r.status === 'pending').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
    }
  }, [allRequestsData?.items])

  const handleSaveAdmin = () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, adminToken.trim())
    localStorage.setItem(ADMIN_NAME_KEY, adminName.trim())
  }

  const pendingRequests = useMemo(
    () => (requestData?.items ?? []).filter((r) => r.status === 'pending'),
    [requestData?.items]
  )

  const toggleSelectRequest = (id: string) => {
    setSelectedRequests((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const ids = pendingRequests.map((r) => r.id)
    if (ids.every((id) => selectedRequests.has(id))) {
      setSelectedRequests(new Set())
    } else {
      setSelectedRequests(new Set(ids))
    }
  }

  const handleBulkApprove = async () => {
    if (!selectedRequests.size) return
    setBulkPending(true)
    for (const id of selectedRequests) {
      await approveMutation.mutateAsync({ id }).catch(() => null)
    }
    setSelectedRequests(new Set())
    setBulkPending(false)
  }

  const handleBulkReject = async () => {
    if (!selectedRequests.size) return
    setBulkPending(true)
    for (const id of selectedRequests) {
      await rejectMutation.mutateAsync({ id }).catch(() => null)
    }
    setSelectedRequests(new Set())
    setBulkPending(false)
  }

  const handleExportRequests = () => {
    const data = requestData?.items ?? []
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `access-requests-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedPendingCount = pendingRequests.filter((r) => selectedRequests.has(r.id)).length

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[rgba(56,139,253,0.3)] bg-[radial-gradient(circle_at_top,_rgba(88,166,255,0.15),_rgba(13,17,23,0.9))] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-accent">Control de accesos</h2>
            <p className="text-sm text-muted mt-2">
              Flujo profesional de incorporación: solicitud → revisión → alta de usuario con código de acceso.
            </p>
          </div>
          <div className="flex gap-3 text-xs text-muted">
            <div className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2">
              <div className="text-amber-300 text-sm font-semibold">{stats.pending}</div>
              <div>Pendientes</div>
            </div>
            <div className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2">
              <div className="text-emerald-300 text-sm font-semibold">{stats.approved}</div>
              <div>Aprobadas</div>
            </div>
            <div className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2">
              <div className="text-accent text-sm font-semibold">{stats.total}</div>
              <div>Total</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
          <h3 className="text-lg font-semibold text-accent">Solicitud de acceso</h3>
          <p className="text-sm text-muted mt-2">
            Complete los datos para generar una solicitud. El administrador recibirá la petición en su panel y aprobará el alta.
          </p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setSubmittedRequest(null)
              requestMutation.mutate(requestInput)
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                value={requestInput.name}
                onChange={(event) => setRequestInput((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Nombre completo"
                className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
              />
              <input
                required
                type="email"
                value={requestInput.email}
                onChange={(event) => setRequestInput((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Correo electrónico"
                className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={requestInput.role}
                onChange={(event) => setRequestInput((prev) => ({ ...prev, role: event.target.value }))}
                placeholder="Rol o cargo"
                className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
              />
              <input
                value={requestInput.organization}
                onChange={(event) => setRequestInput((prev) => ({ ...prev, organization: event.target.value }))}
                placeholder="Organización / equipo"
                className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
              />
            </div>
            <textarea
              value={requestInput.message}
              onChange={(event) => setRequestInput((prev) => ({ ...prev, message: event.target.value }))}
              placeholder="Motivo de la solicitud (opcional)"
              rows={3}
              className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none resize-none"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={requestMutation.isPending}
                className="rounded-lg bg-accent/20 text-accent px-4 py-2 font-medium hover:bg-accent/30 transition disabled:opacity-50"
              >
                {requestMutation.isPending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
              {requestMutation.isError && (
                <span className="text-sm text-red-400">{(requestMutation.error as Error).message}</span>
              )}
            </div>
          </form>

          {submittedRequest && (
            <div className="mt-4 rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
              <p className="text-success font-medium">Solicitud recibida</p>
              <p className="text-muted mt-1">ID: {submittedRequest.id} · Estado: {submittedRequest.status}</p>
              <p className="text-muted mt-1">El administrador revisará la petición y generará el acceso.</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
          <h3 className="text-lg font-semibold text-accent">Panel administrador</h3>
          <p className="text-sm text-muted mt-2">Solo personal autorizado. El token se guarda localmente en este navegador.</p>
          <div className="mt-4 space-y-3">
            <input
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Token de administración"
              className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
            />
            <input
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              placeholder="Nombre del administrador (opcional)"
              className="w-full rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveAdmin}
              className="rounded-lg border border-[rgba(56,139,253,0.3)] px-4 py-2 text-sm text-muted hover:text-accent hover:border-accent/50 transition"
            >
              Guardar configuración
            </button>
            <div className="text-xs text-muted">
              Estado: {adminReady ? 'Administrador configurado' : 'Token requerido para aprobar usuarios'}
            </div>
          </div>

          {lastApproved && (
            <div className="mt-5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm space-y-2">
              <p className="text-emerald-300 font-semibold">✓ Acceso aprobado</p>
              <p className="text-muted">
                <span className="text-[#e6edf3] font-medium">{lastApproved.name}</span>
                {lastApproved.email ? ` · ${lastApproved.email}` : ''}
              </p>

              {/* Enlace personalizado */}
              <div>
                <p className="text-[10px] text-emerald-200/60 uppercase tracking-widest mb-1">Enlace personalizado del avatar</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-md border border-emerald-400/40 px-2 py-1 text-[11px] text-emerald-100 font-mono break-all">
                    {buildPersonalizedLink(lastApproved.access_code)}
                  </span>
                  <CopyButton value={buildPersonalizedLink(lastApproved.access_code)} label="Copiar enlace" />
                </div>
              </div>

              {/* Código de acceso corto */}
              <div>
                <p className="text-[10px] text-emerald-200/60 uppercase tracking-widest mb-1">Código de acceso</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 font-mono tracking-wider">
                    {lastApproved.access_code}
                  </span>
                  <CopyButton value={lastApproved.access_code} label="Copiar" />
                </div>
              </div>

              <p className="text-[10px] text-emerald-200/50 pt-1">
                El avatar ATLAS saludará a {lastApproved.name} por su nombre al abrir el enlace.
              </p>
            </div>
          )}
        </section>

        {/* ── Sección: Crear usuario directamente ───────────────────────────── */}
        <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
          <h3 className="text-lg font-semibold text-accent">Dar acceso directo</h3>
          <p className="text-sm text-muted mt-2">
            Crea un usuario sin necesidad de solicitud. El código de acceso se genera automáticamente (o puedes indicarlo tú).
          </p>

          {!adminReady ? (
            <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
              Configure el token de administración para crear usuarios directamente.
            </div>
          ) : (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => { e.preventDefault(); directCreateMutation.mutate() }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  value={directForm.name}
                  onChange={e => setDirectForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre *"
                  className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                />
                <input
                  type="email"
                  value={directForm.email}
                  onChange={e => setDirectForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Correo (opcional)"
                  className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={directForm.role}
                  onChange={e => setDirectForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Rol (opcional)"
                  className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                />
                <input
                  value={directForm.access_code}
                  onChange={e => setDirectForm(f => ({ ...f, access_code: e.target.value.toUpperCase() }))}
                  placeholder="Código personalizado (opcional)"
                  className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none font-mono"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={directCreateMutation.isPending}
                  className="rounded-lg bg-emerald-500/20 text-emerald-200 px-4 py-2 font-medium hover:bg-emerald-500/30 transition disabled:opacity-50"
                >
                  {directCreateMutation.isPending ? 'Creando…' : 'Crear usuario'}
                </button>
                {directCreateMutation.isError && (
                  <span className="text-sm text-red-400">{(directCreateMutation.error as Error).message}</span>
                )}
              </div>
            </form>
          )}

          {lastDirectCreated && (
            <div className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm space-y-2">
              <p className="text-emerald-300 font-semibold">✓ Usuario creado</p>
              <p className="text-muted">
                <span className="text-[#e6edf3] font-medium">{lastDirectCreated.name}</span>
                {lastDirectCreated.email ? ` · ${lastDirectCreated.email}` : ''}
              </p>
              <div>
                <p className="text-[10px] text-emerald-200/60 uppercase tracking-widest mb-1">Enlace personalizado</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-md border border-emerald-400/40 px-2 py-1 text-[11px] text-emerald-100 font-mono break-all">
                    {buildPersonalizedLink(lastDirectCreated.access_code)}
                  </span>
                  <CopyButton value={buildPersonalizedLink(lastDirectCreated.access_code)} label="Copiar enlace" />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-emerald-200/60 uppercase tracking-widest mb-1">Código de acceso</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 font-mono tracking-wider">
                    {lastDirectCreated.access_code}
                  </span>
                  <CopyButton value={lastDirectCreated.access_code} label="Copiar" />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-accent">Solicitudes en revisión</h3>
            <p className="text-sm text-muted mt-1">Aprobación y generación de usuarios.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={requestFilter}
              onChange={(event) => setRequestFilter(event.target.value as typeof requestFilter)}
              className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
            >
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobadas</option>
              <option value="rejected">Rechazadas</option>
              <option value="all">Todas</option>
            </select>
            <button
              type="button"
              onClick={() => refetchRequests()}
              className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2 text-sm text-muted hover:text-accent hover:border-accent/50 transition"
            >
              Actualizar
            </button>
            {adminReady && (requestData?.items?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={handleExportRequests}
                className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2 text-sm text-muted hover:text-accent hover:border-accent/50 transition"
                title="Exportar solicitudes como JSON"
              >
                Exportar JSON
              </button>
            )}
          </div>
        </div>

        {!adminReady && (
          <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Ingrese el token de administración para ver y aprobar solicitudes.
            </div>
          </div>
        )}

        {adminReady && requestsLoading && (
          <div className="mt-4 space-y-3 animate-pulse">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 rounded-lg bg-[rgba(48,54,61,0.35)]" />
            ))}
          </div>
        )}

        {adminReady && requestsError && (
          <div className="mt-4 text-sm text-red-400">{(requestsError as Error).message}</div>
        )}

        {adminReady && !requestsLoading && !requestsError && (requestData?.items?.length ?? 0) === 0 && (
          <div className="mt-6 flex flex-col items-center py-8 text-center">
            <svg className="w-12 h-12 text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-muted text-sm">No hay solicitudes en este filtro.</p>
            <p className="text-muted text-xs mt-1">Cambia el filtro o espera nuevas solicitudes.</p>
          </div>
        )}

        {/* Bulk action bar */}
        {adminReady && selectedPendingCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
            <span className="text-sm text-accent font-medium">{selectedPendingCount} seleccionadas</span>
            <button
              type="button"
              disabled={bulkPending}
              onClick={handleBulkApprove}
              className="rounded-lg bg-emerald-500/20 text-emerald-200 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500/30 transition disabled:opacity-50"
            >
              {bulkPending ? 'Procesando...' : 'Aprobar seleccionadas'}
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={handleBulkReject}
              className="rounded-lg bg-red-500/20 text-red-200 px-3 py-1.5 text-sm font-medium hover:bg-red-500/30 transition disabled:opacity-50"
            >
              {bulkPending ? 'Procesando...' : 'Rechazar seleccionadas'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedRequests(new Set())}
              className="ml-auto text-xs text-muted hover:text-[#e6edf3] transition"
            >
              Deseleccionar
            </button>
          </div>
        )}

        {adminReady && !requestsLoading && !requestsError && (requestData?.items?.length ?? 0) > 0 && (
          <div className="mt-4 space-y-3">
            {/* Select all for pending */}
            {requestFilter === 'pending' && pendingRequests.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  id="select-all"
                  checked={pendingRequests.length > 0 && pendingRequests.every((r) => selectedRequests.has(r.id))}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
                <label htmlFor="select-all" className="cursor-pointer hover:text-accent transition">
                  Seleccionar todas las pendientes
                </label>
              </div>
            )}

            {(requestData?.items ?? []).map((req) => (
              <div key={req.id} className="rounded-lg border border-[rgba(56,139,253,0.2)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {req.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selectedRequests.has(req.id)}
                        onChange={() => toggleSelectRequest(req.id)}
                        className="mt-1 rounded"
                      />
                    )}
                    <div>
                      <p className="font-medium text-[#e6edf3]">{req.name}</p>
                      <p className="text-xs text-muted">{req.email} · {req.organization || 'Sin organización'} · {req.role || 'Sin rol'}</p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${requestStatusStyle(req.status)}`}>
                    {req.status === 'pending' ? 'Pendiente' : req.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                  </span>
                </div>
                <p className="text-sm text-muted mt-2">{req.message || 'Sin mensaje adicional.'}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                  <span title={formatDate(req.created_at)}>Creada: {relativeTime(req.created_at)}</span>
                  {req.decision_at && <span title={formatDate(req.decision_at)}>Decisión: {relativeTime(req.decision_at)}</span>}
                  {req.decision_by && <span>Responsable: {req.decision_by}</span>}
                </div>

                {req.status === 'pending' ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <input
                      value={decisionNotes[req.id] ?? ''}
                      onChange={(event) => setDecisionNotes((prev) => ({ ...prev, [req.id]: event.target.value }))}
                      placeholder="Nota interna (opcional)"
                      className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate({ id: req.id, note: decisionNotes[req.id] })}
                      className="rounded-lg bg-emerald-500/20 text-emerald-200 px-3 py-2 text-sm font-medium hover:bg-emerald-500/30 transition disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate({ id: req.id, note: decisionNotes[req.id] })}
                      className="rounded-lg bg-red-500/20 text-red-200 px-3 py-2 text-sm font-medium hover:bg-red-500/30 transition disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                ) : (
                  req.decision_note && <p className="text-xs text-muted mt-3">Nota: {req.decision_note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        {/* Barra de presencia en tiempo real — solo visible para admin */}
        {adminReady && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {(() => {
              const all = usersData?.items ?? []
              const onlineNow = all.filter(u => isOnline(u.last_seen))
              return (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse flex-shrink-0" />
                    <span className="text-sm font-semibold text-emerald-300">{onlineNow.length}</span>
                    <span className="text-xs text-emerald-200/70">en línea ahora</span>
                  </div>
                  {onlineNow.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {onlineNow.map(u => (
                        <span key={u.id} className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {u.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="ml-auto text-[10px] text-muted">auto-refresh 15s</span>
                </>
              )
            })()}
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-accent">Usuarios activos</h3>
            <p className="text-sm text-muted mt-1">Usuarios con acceso aprobado al sistema.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value as typeof userFilter)}
              className="rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
            >
              <option value="active">Activos</option>
              <option value="disabled">Deshabilitados</option>
              <option value="all">Todos</option>
            </select>
            <button
              type="button"
              onClick={() => refetchUsers()}
              className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2 text-sm text-muted hover:text-accent hover:border-accent/50 transition"
            >
              Actualizar
            </button>
          </div>
        </div>

        {!adminReady && (
          <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Configure el token para ver usuarios y administrar accesos.
          </div>
        )}

        {adminReady && usersLoading && (
          <div className="mt-4 space-y-3 animate-pulse">
            {[1, 2].map((item) => (
              <div key={item} className="h-16 rounded-lg bg-[rgba(48,54,61,0.35)]" />
            ))}
          </div>
        )}

        {adminReady && usersError && (
          <div className="mt-4 text-sm text-red-400">{(usersError as Error).message}</div>
        )}

        {adminReady && !usersLoading && !usersError && (usersData?.items?.length ?? 0) === 0 && (
          <div className="mt-6 flex flex-col items-center py-8 text-center">
            <svg className="w-12 h-12 text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-muted text-sm">No hay usuarios en este filtro.</p>
          </div>
        )}

        {adminReady && !usersLoading && !usersError && (usersData?.items?.length ?? 0) > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-[rgba(56,139,253,0.2)]">
                  <th className="py-2 text-left">Usuario</th>
                  <th className="py-2 text-left">Rol</th>
                  <th className="py-2 text-left">Estado</th>
                  <th className="py-2 text-left">Enlace personalizado</th>
                  <th className="py-2 text-left">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,139,253,0.1)]">
                {(usersData?.items ?? []).map((user) => (
                  <tr key={user.id}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {isOnline(user.last_seen) ? (
                          <span title="En línea ahora" className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                        ) : (
                          <span title="Sin actividad reciente" className="flex-shrink-0 w-2 h-2 rounded-full bg-slate-600" />
                        )}
                        <div className="font-medium text-[#e6edf3]">{user.name}</div>
                      </div>
                      <div className="text-xs text-muted pl-4">
                        {user.email || '—'}
                        {user.last_seen && (
                          <span className="ml-2 text-emerald-400/70">
                            · visto {relativeTime(user.last_seen)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-muted">{user.role || '—'}</td>
                    <td className="py-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${userStatusStyle(user.status)}`}>
                        {user.status === 'active' ? 'Activo' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-md border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-200 font-mono max-w-[140px] truncate" title={buildPersonalizedLink(user.access_code)}>
                          /?u={user.access_code}
                        </span>
                        <CopyButton value={buildPersonalizedLink(user.access_code)} label="Copiar enlace" />
                      </div>
                    </td>
                    <td className="py-2 text-xs text-muted" title={formatDate(user.created_at)}>
                      {relativeTime(user.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
