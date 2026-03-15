const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/vault'

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

export async function getVaultCatalog(params: VaultCatalogParams = {}): Promise<VaultCatalogResponse> {
  const qs = new URLSearchParams()
  if (params.channel)  qs.set('channel',  params.channel)
  if (params.category) qs.set('category', params.category)
  if (params.genre)    qs.set('genre',    params.genre)
  if (params.q)        qs.set('q',        params.q)
  const res = await fetch(`${BASE}/catalog?${qs}`)
  if (!res.ok) throw new Error(`vault catalog: ${res.status}`)
  return res.json()
}

export function vaultStreamUrl(id: string): string {
  return `${BASE}/stream/${id}`
}

export async function getVaultStatus(adminToken: string): Promise<VaultStatusResponse> {
  const res = await fetch(`${BASE}/admin/status`, {
    headers: { 'X-Admin-Token': adminToken },
  })
  if (!res.ok) throw new Error(`vault status: ${res.status}`)
  return res.json()
}

export async function rotateVault(adminToken: string, slot?: RotationSlot): Promise<{ ok: boolean; active_slot: string }> {
  const res = await fetch(`${BASE}/admin/rotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
    body: JSON.stringify(slot ? { slot } : {}),
  })
  return res.json()
}

export async function deleteVaultItem(adminToken: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/admin/item/${id}`, {
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
