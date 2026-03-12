const BASE = ''

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

export type VideoSearchItem = {
  id: string
  title: string
  channel: string
  duration_sec: number
  thumbnail_url?: string
  description?: string
  category?: string
  watch_url?: string
  cuba_ready?: boolean
}

export type VideoChannelHealth = {
  id: string
  title: string
  channel: string
  url: string
  cuba_mode: boolean
  cuba_ready: boolean
  reachable: boolean
  status_code: number
  latency_ms: number
  error?: string
  checked_at: string
}

export async function videoSearch(q: string, max = 15): Promise<{ results: VideoSearchItem[]; cached?: boolean }> {
  const r = await fetch(`${BASE}/api/video/search?q=${encodeURIComponent(q)}&max=${max}`)
  if (!r.ok) throw new Error('Búsqueda de video fallida')
  return r.json()
}

export async function videoMeta(id: string): Promise<{
  id: string
  title: string
  channel: string
  duration_sec: number
  qualities: string[]
  ready: boolean
  live?: boolean
  description?: string
  watch_url?: string
  cuba_url?: string
}> {
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

export async function videoChannelsHealth(max = 12, mode: 'cuba' | 'direct' = 'cuba'): Promise<{
  items: VideoChannelHealth[]
  mode: string
  checked_at: string
  total: number
  reachable: number
  unavailable: number
}> {
  const r = await fetch(`${BASE}/api/video/channels/health?max=${max}&mode=${encodeURIComponent(mode)}`)
  if (!r.ok) throw new Error('No se pudo comprobar la salud de los canales')
  return r.json()
}

export type ChatRuntime = {
  provider?: string
  family?: string
  model?: string
  route?: string
  latency_ms?: number
  offline?: boolean
}

export async function chat(message: string, contextUrl?: string): Promise<{ reply: string; sources_used?: string[]; runtime?: ChatRuntime }> {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context_url: contextUrl || '' }),
  })
  if (!r.ok) throw new Error('Chat fallido')
  return r.json()
}

// ── TikTok proxy API ─────────────────────────────────────────────────────────

export type TikTokStatus = {
  available: boolean
  cuba_bypass: boolean
  description: string
  note: string
}

export type TikTokVideoInfo = {
  id: string
  title: string
  uploader: string
  duration_sec: number
  thumbnail_url?: string
  stream_url: string
  original_url: string
  source: string
  cuba_ready: boolean
}

export async function tiktokStatus(): Promise<TikTokStatus> {
  const r = await fetch(`${BASE}/api/tiktok/status`)
  if (!r.ok) throw new Error('No se pudo verificar el estado del proxy TikTok')
  return r.json()
}

export async function tiktokFetch(url: string): Promise<TikTokVideoInfo> {
  const r = await fetch(`${BASE}/api/tiktok/fetch?url=${encodeURIComponent(url)}`)
  if (!r.ok) {
    const body = await r.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message || 'No se pudo obtener el video de TikTok')
  }
  return r.json()
}

export function tiktokStreamUrl(streamUrl: string): string {
  return `${BASE}/api/tiktok/stream?url=${encodeURIComponent(streamUrl)}`
}

// ── CAMI Channel API ──────────────────────────────────────────────────────────

export type CamiSong = {
  id: string; title: string; artist: string; duration: string
  uploadDate: string; fileSize: string; format: string
  status: 'published' | 'draft' | 'processing'
  plays: number; genre?: string; album?: string
  explicit: boolean; trackNumber?: number; createdAt: string; updatedAt: string
}
export type CamiAlbum = {
  id: string; title: string; artist: string; releaseDate: string
  coverImage: string; songCount: number; status: 'published' | 'draft'
  createdAt: string; updatedAt: string
}
export type CamiStats = {
  totalSongs: number; totalAlbums: number; totalPlays: number
  engagementRate: number; monthlyListeners: number
}

export async function camiGetSongs(): Promise<CamiSong[]> {
  const r = await fetch(`${BASE}/api/cami/songs`)
  if (!r.ok) throw new Error('No se pudieron cargar las canciones')
  return r.json()
}
export async function camiGetAlbums(): Promise<CamiAlbum[]> {
  const r = await fetch(`${BASE}/api/cami/albums`)
  if (!r.ok) throw new Error('No se pudieron cargar los álbumes')
  return r.json()
}
export async function camiGetStats(): Promise<CamiStats> {
  const r = await fetch(`${BASE}/api/cami/stats`)
  if (!r.ok) throw new Error('No se pudieron cargar las estadísticas')
  return r.json()
}
export async function camiCreateSong(data: Partial<CamiSong>): Promise<CamiSong> {
  const r = await fetch(`${BASE}/api/cami/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo crear la canción'))
  return r.json()
}
export async function camiUpdateSong(id: string, data: Partial<CamiSong>): Promise<CamiSong> {
  const r = await fetch(`${BASE}/api/cami/songs/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo actualizar'))
  return r.json()
}
export async function camiDeleteSong(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/cami/songs/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo eliminar'))
}
export async function camiPlaySong(id: string): Promise<void> {
  await fetch(`${BASE}/api/cami/songs/${encodeURIComponent(id)}/play`, { method: 'POST' })
}
export async function camiCreateAlbum(data: Partial<CamiAlbum>): Promise<CamiAlbum> {
  const r = await fetch(`${BASE}/api/cami/albums`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo crear el álbum'))
  return r.json()
}
export async function camiUpload(file: File, meta: Partial<CamiSong>): Promise<CamiSong> {
  const form = new FormData()
  form.append('file', file)
  Object.entries(meta).forEach(([k, v]) => { if (v !== undefined) form.append(k, String(v)) })
  const r = await fetch(`${BASE}/api/cami/upload`, { method: 'POST', body: form })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo subir el archivo'))
  return r.json()
}
export async function camiSearch(q: string): Promise<CamiSong[]> {
  const r = await fetch(`${BASE}/api/cami/search?q=${encodeURIComponent(q)}`)
  if (!r.ok) throw new Error('Búsqueda fallida')
  return r.json()
}
export function camiStreamUrl(id: string): string {
  return `${BASE}/api/cami/stream/${encodeURIComponent(id)}`
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

export async function processFeedback(data: {
  type: string; severity: string; title: string; description: string
  screenshot?: string; systemInfo?: Record<string, unknown>
}): Promise<{ ok: boolean; analysis?: string; estimated_fix_time?: string; auto_fix?: boolean }> {
  const r = await fetch('/api/feedback/brain', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  })
  if (!r.ok) throw new Error(await parseError(r, 'Error al enviar feedback'))
  return r.json()
}
