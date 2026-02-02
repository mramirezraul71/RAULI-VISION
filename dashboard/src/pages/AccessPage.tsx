import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAccessRequest,
  createAccessRequest,
  listAccessRequests,
  listAccessUsers,
  rejectAccessRequest,
  updateAccessUserStatus,
  type AccessRequest,
  type AccessRequestInput,
  type AccessUser,
} from '../api/client'

const ADMIN_TOKEN_KEY = 'rauli_admin_token'
const ADMIN_NAME_KEY = 'rauli_admin_name'

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

  const { data: usersData, isFetching: usersLoading, error: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['accessUsers', adminToken, userFilter],
    queryFn: () => listAccessUsers(adminToken, userFilter === 'all' ? undefined : userFilter),
    enabled: adminReady,
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      approveAccessRequest(id, adminToken, { note, decidedBy: adminName }),
    onSuccess: (data) => {
      setLastApproved(data.user)
      queryClient.invalidateQueries({ queryKey: ['accessRequests'] })
      queryClient.invalidateQueries({ queryKey: ['accessUsers'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      rejectAccessRequest(id, adminToken, { note, decidedBy: adminName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessRequests'] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccessUser['status'] }) =>
      updateAccessUserStatus(id, status, adminToken, adminName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accessUsers'] }),
  })

  const stats = useMemo(() => {
    const items = requestData?.items ?? []
    return {
      total: items.length,
      pending: items.filter((r) => r.status === 'pending').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
    }
  }, [requestData?.items])

  const handleSaveAdmin = () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, adminToken.trim())
    localStorage.setItem(ADMIN_NAME_KEY, adminName.trim())
  }

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
              <div className="text-accent text-sm font-semibold">{stats.pending}</div>
              <div>Pendientes</div>
            </div>
            <div className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-2">
              <div className="text-accent text-sm font-semibold">{stats.approved}</div>
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
              <p className="text-success font-medium">Solicitud recibida ✅</p>
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
              Estado: {adminReady ? '✅ Administrador configurado' : '⚠️ Token requerido para aprobar usuarios'}
            </div>
          </div>

          {lastApproved && (
            <div className="mt-5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm">
              <p className="text-emerald-300 font-medium">Acceso aprobado</p>
              <p className="text-muted mt-1">Usuario: {lastApproved.name} · {lastApproved.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200">
                  Código: {lastApproved.access_code}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(lastApproved.access_code)}
                  className="text-xs text-emerald-200 hover:text-emerald-100"
                >
                  Copiar código
                </button>
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
          </div>
        </div>

        {!adminReady && (
          <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Ingrese el token de administración para ver y aprobar solicitudes.
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

        {adminReady && !requestsLoading && !requestsError && (
          <div className="mt-4 space-y-3">
            {(requestData?.items ?? []).map((req) => (
              <div key={req.id} className="rounded-lg border border-[rgba(56,139,253,0.2)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#e6edf3]">{req.name}</p>
                    <p className="text-xs text-muted">{req.email} · {req.organization || 'Sin organización'} · {req.role || 'Sin rol'}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${requestStatusStyle(req.status)}`}>
                    {req.status === 'pending' ? 'Pendiente' : req.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                  </span>
                </div>
                <p className="text-sm text-muted mt-2">{req.message || 'Sin mensaje adicional.'}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                  <span>Creada: {formatDate(req.created_at)}</span>
                  {req.decision_at && <span>Decisión: {formatDate(req.decision_at)}</span>}
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

            {(requestData?.items?.length ?? 0) === 0 && (
              <p className="text-sm text-muted">No hay solicitudes en este filtro.</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-accent">Usuarios activos</h3>
            <p className="text-sm text-muted mt-1">Gestione activaciones y suspensiones.</p>
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

        {adminReady && !usersLoading && !usersError && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-[rgba(56,139,253,0.2)]">
                  <th className="py-2 text-left">Usuario</th>
                  <th className="py-2 text-left">Rol</th>
                  <th className="py-2 text-left">Estado</th>
                  <th className="py-2 text-left">Acceso</th>
                  <th className="py-2 text-left">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,139,253,0.1)]">
                {(usersData?.items ?? []).map((user) => (
                  <tr key={user.id}>
                    <td className="py-2">
                      <div className="font-medium text-[#e6edf3]">{user.name}</div>
                      <div className="text-xs text-muted">{user.email}</div>
                    </td>
                    <td className="py-2 text-muted">{user.role || '—'}</td>
                    <td className="py-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${userStatusStyle(user.status)}`}>
                        {user.status === 'active' ? 'Activo' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td className="py-2 text-muted">
                      <span className="rounded-md border border-[rgba(56,139,253,0.3)] px-2 py-1 text-xs text-[#e6edf3]">
                        {user.access_code}
                      </span>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            id: user.id,
                            status: user.status === 'active' ? 'disabled' : 'active',
                          })
                        }
                        className="rounded-lg border border-[rgba(56,139,253,0.3)] px-3 py-1 text-xs text-muted hover:text-accent hover:border-accent/50 transition disabled:opacity-50"
                      >
                        {user.status === 'active' ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(usersData?.items?.length ?? 0) === 0 && (
              <p className="text-sm text-muted mt-3">No hay usuarios en este filtro.</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
