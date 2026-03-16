const BASE = ''

/** Lee el token de usuario del localStorage para inyectar ?u= en las llamadas API */
function userToken(): string {
  try { return localStorage.getItem('rauli_user_token') ?? '' } catch { return '' }
}

/** Añade ?u=TOKEN a la URL para que espejo registre actividad real del usuario */
function withUser(url: string): string {
  const t = userToken()
  if (!t) return url
  return url + (url.includes('?') ? '&' : '?') + 'u=' + encodeURIComponent(t)
}

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
  last_seen?: string
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
    r = await fetch(withUser(`${BASE}/api/search?q=${encodeURIComponent(q)}&max=${max}`))
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
  const r = await fetch(withUser(`${BASE}/api/video/search?q=${encodeURIComponent(q)}&max=${max}`))
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
  web_url?: string
  fallback_web_url?: string
  hls_proxy_url?: string
  has_hls?: boolean
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
  const r = await fetch(withUser(`${BASE}/api/chat`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context_url: contextUrl || '' }),
  })
  if (!r.ok) throw new Error('Chat fallido')
  return r.json()
}

// ── TikTok proxy API ─────────────────────────────────────────────────────────

export type TikTokFeedItem = {
  id: string
  title: string
  uploader: string
  avatar?: string
  duration_sec: number
  thumbnail_url?: string
  stream_url: string
  digg_count?: number
  comment_count?: number
  share_count?: number
}

export type TikTokFeedResponse = {
  items: TikTokFeedItem[]
  cursor: string
  has_more: boolean
}

export async function tiktokTrending(count = 20, cursor = ''): Promise<TikTokFeedResponse & { cached_at?: string }> {
  const r = await fetch(withUser(`${BASE}/api/tiktok/trending?count=${count}&cursor=${encodeURIComponent(cursor)}`))
  if (!r.ok) throw new Error('No se pudieron cargar las tendencias de TikTok')
  return r.json()
}

/** Abre un EventSource SSE para recibir actualizaciones automáticas de tendencias. */
export function tiktokTrendingLive(
  onInitial: (items: TikTokFeedItem[], cachedAt: string) => void,
  onUpdate: (items: TikTokFeedItem[], cachedAt: string) => void,
): EventSource {
  const es = new EventSource(`${BASE}/api/tiktok/trending/live`)
  es.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        type: 'initial' | 'update'
        items: TikTokFeedItem[]
        cached_at: string
      }
      if (payload.type === 'initial') onInitial(payload.items, payload.cached_at)
      else if (payload.type === 'update') onUpdate(payload.items, payload.cached_at)
    } catch { /* ignore parse errors */ }
  }
  return es
}

export async function tiktokSearch(q: string, count = 20, cursor = ''): Promise<TikTokFeedResponse & { query: string }> {
  const r = await fetch(withUser(`${BASE}/api/tiktok/search?q=${encodeURIComponent(q)}&count=${count}&cursor=${encodeURIComponent(cursor)}`))
  if (!r.ok) throw new Error('Búsqueda de TikTok fallida')
  return r.json()
}

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

/** Heartbeat de presencia — llamar cada 30s desde AtlasCompanion */
export async function pingPresence(accessCode: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/access/presence/${encodeURIComponent(accessCode)}`, { method: 'POST' })
  } catch { /* best-effort */ }
}

// ── TTS (Text-to-Speech) — Gemini 2.5 Flash Preview TTS ──────────────────────

/**
 * Sintetiza texto a audio WAV usando Gemini TTS del servidor (voz Aoede).
 * Devuelve un Blob audio/wav listo para reproducir, o null si falla.
 */
export async function synthesizeSpeech(text: string): Promise<Blob | null> {
  try {
    const r = await fetch(`${BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!r.ok) return null
    return await r.blob()
  } catch {
    return null
  }
}

/** Lee la preferencia de voz desde localStorage. Por defecto: activada. */
export function getVoiceEnabled(): boolean {
  try { return localStorage.getItem('rauli_voice_enabled') !== 'false' } catch { return true }
}

/** Guarda la preferencia de voz en localStorage. */
export function setVoiceEnabled(enabled: boolean): void {
  try { localStorage.setItem('rauli_voice_enabled', enabled ? 'true' : 'false') } catch {}
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

/** Valida si un código de acceso es válido (está registrado y activo). */
export async function validateAccessCode(code: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/access/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!r.ok) return false
    const data = await r.json() as { valid: boolean }
    return data.valid === true
  } catch {
    return false
  }
}

export type DirectCreateInput = {
  name: string
  email?: string
  role?: string
  organization?: string
  access_code?: string
}

/** Crea un usuario directamente sin pasar por el flujo de solicitud (requiere admin token). */
export async function directCreateUser(input: DirectCreateInput, adminToken: string, adminName?: string): Promise<{ user: AccessUser }> {
  if (!adminToken) throw new Error('Token admin requerido')
  const r = await fetch(`${BASE}/api/access/users/direct`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(adminToken, adminName),
    },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo crear el usuario'))
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

// ── Clima ─────────────────────────────────────────────────────────────────────

export type WeatherCurrent = {
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  wind_speed_10m: number
  wind_direction_10m: number
  precipitation: number
  weather_code: number
  is_day: number
  time: string
}

export type WeatherDaily = {
  date: string
  temp_max: number
  temp_min: number
  precip_sum: number
  weather_code: number
}

export type WeatherData = {
  city: string
  lat: number
  lon: number
  timezone: string
  current: WeatherCurrent
  daily: WeatherDaily[]
  fetched_at: string
}

export async function climaByCity(city: string): Promise<WeatherData> {
  const r = await fetch(withUser(`${BASE}/api/clima?city=${encodeURIComponent(city)}`))
  if (!r.ok) throw new Error(await parseError(r, 'Error obteniendo clima'))
  return r.json()
}

export async function climaCities(): Promise<{ cities: string[] }> {
  const r = await fetch(`${BASE}/api/clima/cities`)
  if (!r.ok) throw new Error('Error obteniendo ciudades')
  return r.json()
}

// ── Noticias ──────────────────────────────────────────────────────────────────

export type NewsArticle = {
  title: string
  link: string
  description: string
  pub_date: string
  source: string
  source_key: string
  image_url?: string
}

export type NewsFeed = {
  key: string
  name: string
  category: string
  language: string
}

export async function noticiasFeeds(): Promise<{ feeds: NewsFeed[] }> {
  const r = await fetch(`${BASE}/api/noticias/feeds`)
  if (!r.ok) throw new Error('Error obteniendo fuentes de noticias')
  return r.json()
}

export async function noticias(category: string, limit = 30): Promise<{ articles: NewsArticle[]; category: string; total: number }> {
  const r = await fetch(withUser(`${BASE}/api/noticias?category=${encodeURIComponent(category)}&limit=${limit}`))
  if (!r.ok) throw new Error(await parseError(r, 'Error obteniendo noticias'))
  return r.json()
}

export async function noticiasByFeed(key: string, limit = 30): Promise<{ articles: NewsArticle[]; source: string; total: number }> {
  const r = await fetch(withUser(`${BASE}/api/noticias/${encodeURIComponent(key)}?limit=${limit}`))
  if (!r.ok) throw new Error(await parseError(r, 'Error obteniendo feed'))
  return r.json()
}

// ── Radio ─────────────────────────────────────────────────────────────────────

export type RadioStation = {
  id: string
  name: string
  country: string
  country_code: string
  language: string
  tags: string
  codec: string
  bitrate: number
  stream_url: string
  favicon?: string
  votes: number
  clickcount: number
}

export async function radioPopular(limit = 20, cc = ''): Promise<{ stations: RadioStation[]; total: number }> {
  const qs = cc ? `?limit=${limit}&cc=${encodeURIComponent(cc)}` : `?limit=${limit}`
  const r = await fetch(withUser(`${BASE}/api/radio/popular${qs}`))
  if (!r.ok) throw new Error(await parseError(r, 'Error obteniendo estaciones'))
  return r.json()
}

export async function radioSearch(q: string, limit = 20): Promise<{ stations: RadioStation[]; total: number; query: string }> {
  const r = await fetch(withUser(`${BASE}/api/radio/search?q=${encodeURIComponent(q)}&limit=${limit}`))
  if (!r.ok) throw new Error(await parseError(r, 'Error buscando estaciones'))
  return r.json()
}

export async function radioByCountry(cc: string, limit = 20): Promise<{ stations: RadioStation[]; total: number }> {
  const r = await fetch(withUser(`${BASE}/api/radio/country?cc=${encodeURIComponent(cc)}&limit=${limit}`))
  if (!r.ok) throw new Error(await parseError(r, 'Error obteniendo estaciones del país'))
  return r.json()
}

// ── Traducir ──────────────────────────────────────────────────────────────────

export type TranslationResult = {
  original_text: string
  translated_text: string
  lang_pair: string
  match_quality: number
  source: string
}

export type LangPair = {
  code: string
  label: string
}

export async function traducirPairs(): Promise<{ pairs: LangPair[] }> {
  const r = await fetch(`${BASE}/api/traducir/pairs`)
  if (!r.ok) throw new Error('Error obteniendo pares de idiomas')
  return r.json()
}

export async function traducir(text: string, langPair: string): Promise<TranslationResult> {
  const r = await fetch(`${BASE}/api/traducir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang_pair: langPair }),
  })
  if (!r.ok) throw new Error(await parseError(r, 'Traducción fallida'))
  return r.json()
}

// ── YouTube ───────────────────────────────────────────────────────────────────

export type YouTubeResult = {
  id: string
  title: string
  author: string
  duration_sec: number
  thumbnail_url?: string
  view_count?: number
  published?: string
}

export async function youtubeSearch(q: string, max = 15): Promise<{ query: string; results: YouTubeResult[]; total: number }> {
  const r = await fetch(withUser(`${BASE}/api/youtube/search?q=${encodeURIComponent(q)}&max=${max}`))
  if (!r.ok) throw new Error(await parseError(r, 'Búsqueda de YouTube fallida'))
  return r.json()
}

export async function youtubeStream(id: string): Promise<{ id: string; stream_url: string; source: string }> {
  const r = await fetch(`${BASE}/api/youtube/stream?id=${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error(await parseError(r, 'No se pudo obtener el stream'))
  return r.json()
}

export function youtubeProxyUrl(streamUrl: string): string {
  return `${BASE}/api/youtube/proxy?url=${encodeURIComponent(streamUrl)}`
}
