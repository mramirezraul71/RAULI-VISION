// En dev: '' usa el proxy de Vite. En prod: VITE_API_URL apunta al puente Cloudflare.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const BASE = API_BASE

export type Health = {
  status?: string
  proxy?: string
  espejo?: string
  version?: string
  cache_entries?: number
  cache_size_bytes?: number
}

export type AccessRequest = {
  id: string
  name: string
  email: string
  role?: string
  organization?: string
  message?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
  decision_at?: string
  decision_by?: string
  decision_note?: string
  requester_ip?: string
  user_agent?: string
}

export type AccessUser = {
  id: string
  request_id?: string
  name: string
  email: string
  role?: string
  organization?: string
  status: 'active' | 'disabled'
  access_code: string
  created_at: string
  updated_at: string
  activated_at?: string
  disabled_at?: string
  approved_by?: string
}

export type AccessRequestInput = {
  name: string
  email: string
  role?: string
  organization?: string
  message?: string
}

export type AccessDecisionInput = {
  note?: string
  decidedBy?: string
}

export type AccessListResponse<T> = {
  items: T[]
  total: number
}

export async function getHealth(): Promise<Health> {
  const r = await fetch(`${BASE}/api/health`)
  if (!r.ok) throw new Error('API no disponible')
  return r.json()
}

function adminHeaders(adminToken: string, adminName?: string) {
  const headers: Record<string, string> = {
    'X-Admin-Token': adminToken,
  }
  if (adminName?.trim()) {
    headers['X-Admin-Name'] = adminName.trim()
  }
  return headers
}

async function parseError(r: Response, fallback: string) {
  const ct = r.headers.get('content-type')
  if (ct?.includes('application/json')) {
    try {
      const body = await r.json() as { message?: string; error?: string }
      if (body.message || body.error) return body.message || body.error || fallback
    } catch {
      // ignore
    }
  }
  return fallback
}

export async function search(q: string, max = 20): Promise<{ query: string; results: { title: string; url: string; snippet: string }[]; cached?: boolean }> {
  let r: Response
  try {
    r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&max=${max}`)
  } catch {
    throw new Error('No hay conexión con el servidor. Compruebe que el proxy y el espejo estén en marcha.')
  }
  if (!r.ok) {
    if (r.status === 502 || r.status === 503)
      throw new Error('El servidor espejo no está disponible. Compruebe que el espejo esté en marcha (puerto 8080).')
    if (r.status === 404)
      throw new Error('API no encontrada. Asegúrese de usar el proxy (puerto 3000), no solo el archivo estático.')
    if (r.status === 429)
      throw new Error('Demasiadas búsquedas. Espere un momento y vuelva a intentar.')
    const ct = r.headers.get('content-type')
    if (ct?.includes('application/json')) {
      try {
        const body = await r.json() as { message?: string; error?: string }
        const msg = body.message || body.error
        if (msg) throw new Error(msg)
      } catch (e) {
        if (e instanceof Error && e.message !== 'Failed to fetch') throw e
      }
    }
    throw new Error('Búsqueda fallida. Reintente más tarde.')
  }
  return r.json()
}

export async function videoSearch(q: string, max = 15): Promise<{ results: { id: string; title: string; channel: string; duration_sec: number }[]; cached?: boolean }> {
  const r = await fetch(`${BASE}/api/video/search?q=${encodeURIComponent(q)}&max=${max}`)
  if (!r.ok) throw new Error('Búsqueda de video fallida')
  return r.json()
}

export async function videoMeta(id: string): Promise<{ id: string; title: string; channel: string; duration_sec: number; qualities: string[]; ready: boolean }> {
  const r = await fetch(`${BASE}/api/video/${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error('Video no encontrado')
  return r.json()
}

export async function videoRequest(id: string, quality = '360p'): Promise<{ job_id: string; status: string; message: string }> {
  const r = await fetch(`${BASE}/api/video/${encodeURIComponent(id)}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quality }),
  })
  if (!r.ok) throw new Error('Solicitud fallida')
  return r.json()
}

export async function videoStatus(id: string, jobId: string): Promise<{ job_id: string; status: string; progress_percent: number }> {
  const r = await fetch(`${BASE}/api/video/${encodeURIComponent(id)}/status?job_id=${encodeURIComponent(jobId)}`)
  if (!r.ok) throw new Error('Estado no disponible')
  return r.json()
}

export async function chat(message: string, contextUrl?: string): Promise<{ reply: string; sources_used?: string[] }> {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context_url: contextUrl || '' }),
  })
  if (!r.ok) throw new Error('Chat fallido')
  return r.json()
}

export async function chatHistory(): Promise<{ items: { id: string; role: string; preview: string; ts: string }[] }> {
  const r = await fetch(`${BASE}/api/chat/history`)
  if (!r.ok) throw new Error('Historial no disponible')
  return r.json()
}

export async function createAccessRequest(input: AccessRequestInput): Promise<{ request: AccessRequest }> {
  const r = await fetch(`${BASE}/api/access/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo enviar la solicitud.'))
  return r.json()
}

export async function listAccessRequests(adminToken: string, status?: string): Promise<AccessListResponse<AccessRequest>> {
  if (!adminToken) throw new Error('Token admin requerido')
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const r = await fetch(`${BASE}/api/access/requests${qs}`, {
    headers: adminHeaders(adminToken),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo cargar la bandeja.'))
  return r.json()
}

export async function approveAccessRequest(id: string, adminToken: string, input: AccessDecisionInput): Promise<{ request: AccessRequest; user: AccessUser }> {
  if (!adminToken) throw new Error('Token admin requerido')
  const r = await fetch(`${BASE}/api/access/requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(adminToken, input.decidedBy),
    },
    body: JSON.stringify({ note: input.note || '', decided_by: input.decidedBy || '' }),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo aprobar la solicitud.'))
  return r.json()
}

export async function rejectAccessRequest(id: string, adminToken: string, input: AccessDecisionInput): Promise<{ request: AccessRequest }> {
  if (!adminToken) throw new Error('Token admin requerido')
  const r = await fetch(`${BASE}/api/access/requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(adminToken, input.decidedBy),
    },
    body: JSON.stringify({ note: input.note || '', decided_by: input.decidedBy || '' }),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo rechazar la solicitud.'))
  return r.json()
}

export async function listAccessUsers(adminToken: string, status?: string): Promise<AccessListResponse<AccessUser>> {
  if (!adminToken) throw new Error('Token admin requerido')
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const r = await fetch(`${BASE}/api/access/users${qs}`, {
    headers: adminHeaders(adminToken),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo cargar los usuarios.'))
  return r.json()
}

export async function updateAccessUserStatus(id: string, status: 'active' | 'disabled', adminToken: string, adminName?: string): Promise<{ user: AccessUser }> {
  if (!adminToken) throw new Error('Token admin requerido')
  const r = await fetch(`${BASE}/api/access/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(adminToken, adminName),
    },
    body: JSON.stringify({ status }),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo actualizar el usuario.'))
  return r.json()
}
