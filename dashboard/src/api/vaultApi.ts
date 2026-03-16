const ENV_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const PRIMARY_BASE = ENV_BASE ? `${ENV_BASE}/api/vault` : '/api/vault'
// Fallback: /vault pasa por el proxy cliente-local que reescribe a /api/vault internamente
const FALLBACK_BASES = ['/api/vault', '/vault']
// 401 NO es reintentable — significa que el usuario no está autorizado, no un error de red
const RETRYABLE_STATUS = new Set([404, 502, 503, 504])

let activeBase = PRIMARY_BASE

function getCandidateBases(): string[] {
  return Array.from(new Set([activeBase, PRIMARY_BASE, ...FALLBACK_BASES]))
}

async function requestVault(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown = null
  let lastResponse: Response | null = null

  for (const base of getCandidateBases()) {
    try {
      const res = await fetch(`${base}${path}`, init)
      if (res.ok) {
        activeBase = base
        return res
      }
      lastResponse = res
      if (!RETRYABLE_STATUS.has(res.status)) {
        return res
      }
    } catch (err) {
      lastError = err
    }
  }

  if (lastResponse) return lastResponse
  if (lastError instanceof Error) throw lastError
  throw new Error('vault request failed')
}

export type VaultChannel = 'cami' | 'variado'
export type VaultCategory = 'pelicula' | 'musica' | 'musicvideo'
export type RotationSlot = 'A' | 'B' | 'C' | 'D'

export interface VaultItem {
  id: string
  title: string
  artist?: string
  category: VaultCategory
  channel: VaultChannel
  genre?: string
  filename: string
  thumbnail?: string
  duration_secs?: number
  file_size_bytes?: number
  rotation_slot?: RotationSlot
  active: boolean
  plays: number
  created_at: string
}

export interface VaultCatalogResponse {
  ok: boolean
  items: VaultItem[]
  total: number
  channel?: string
  category?: string
}

export interface VaultStatusResponse {
  ok: boolean
  vault_root: string
  total_items: number
  active_items: number
  total_size_gb: number
  active_slot: string
  next_rotation: string
  db_path: string
}

export interface VaultCatalogParams {
  channel?: VaultChannel
  category?: VaultCategory
  genre?: string
  q?: string
}

/** Lee el token de usuario del localStorage para inyectar ?u= en las llamadas autenticadas */
function vaultUserToken(): string {
  try { return localStorage.getItem('rauli_user_token') ?? '' } catch { return '' }
}

export async function getVaultCatalog(params: VaultCatalogParams = {}): Promise<VaultCatalogResponse> {
  const qs = new URLSearchParams()
  if (params.channel)  qs.set('channel',  params.channel)
  if (params.category) qs.set('category', params.category)
  if (params.genre)    qs.set('genre',    params.genre)
  if (params.q)        qs.set('q',        params.q)
  // Inyectar token de usuario para requireAuth en el backend
  const ut = vaultUserToken()
  if (ut) qs.set('u', ut)
  const suffix = qs.toString() ? `/catalog?${qs}` : '/catalog'
  const res = await requestVault(suffix)
  if (!res.ok) throw new Error(`vault catalog: ${res.status}`)
  return res.json()
}

export function vaultStreamUrl(id: string): string {
  return `${activeBase}/stream/${id}`
}

export async function getVaultStatus(adminToken: string): Promise<VaultStatusResponse> {
  const res = await requestVault('/admin/status', {
    headers: { 'X-Admin-Token': adminToken },
  })
  if (!res.ok) throw new Error(`vault status: ${res.status}`)
  return res.json()
}

export async function rotateVault(adminToken: string, slot?: RotationSlot): Promise<{ ok: boolean; active_slot: string }> {
  const res = await requestVault('/admin/rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
    body: JSON.stringify(slot ? { slot } : {}),
  })
  return res.json()
}

export async function deleteVaultItem(adminToken: string, id: string): Promise<{ ok: boolean }> {
  const res = await requestVault(`/admin/item/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  })
  return res.json()
}

/** Formatea duración en segundos → mm:ss */
export function formatDuration(secs?: number): string {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Formatea tamaño en bytes → MB/GB legible */
export function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
