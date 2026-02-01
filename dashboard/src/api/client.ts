const BASE = ''

export type Health = {
  status?: string
  proxy?: string
  espejo?: string
  version?: string
  cache_entries?: number
  cache_size_bytes?: number
}

export async function getHealth(): Promise<Health> {
  const r = await fetch(`${BASE}/api/health`)
  if (!r.ok) throw new Error('API no disponible')
  return r.json()
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
