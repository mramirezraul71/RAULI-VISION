import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CamiSong,
  camiCreateAlbum,
  camiDeleteSong,
  camiGetAlbums,
  camiGetSongs,
  camiGetStats,
  camiPlaySong,
  camiUpdateSong,
  camiUpload,
} from '../api/client'

type Tab = 'songs' | 'albums' | 'upload' | 'analytics'

export function CamiPage() {
  const [activeTab, setActiveTab] = useState<Tab>('songs')
  const qc = useQueryClient()

  const { data: songs = [], isLoading: loadingSongs } = useQuery({ queryKey: ['cami-songs'], queryFn: camiGetSongs })
  const { data: albums = [], isLoading: loadingAlbums } = useQuery({ queryKey: ['cami-albums'], queryFn: camiGetAlbums })
  const { data: stats } = useQuery({ queryKey: ['cami-stats'], queryFn: camiGetStats })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['cami-songs'] }); qc.invalidateQueries({ queryKey: ['cami-stats'] }) }

  // ── Delete ──
  const deleteMut = useMutation({
    mutationFn: camiDeleteSong,
    onSuccess: invalidate,
  })

  // ── Play counter ──
  const playMut = useMutation({ mutationFn: camiPlaySong, onSuccess: invalidate })

  // ── Edit inline ──
  const [editing, setEditing] = useState<CamiSong | null>(null)
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CamiSong> }) => camiUpdateSong(id, data),
    onSuccess: () => { setEditing(null); invalidate() },
  })

  // ── New album ──
  const [newAlbumTitle, setNewAlbumTitle] = useState('')
  const albumMut = useMutation({
    mutationFn: camiCreateAlbum,
    onSuccess: () => { setNewAlbumTitle(''); qc.invalidateQueries({ queryKey: ['cami-albums'] }) },
  })

  // ── Upload ──
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadMeta, setUploadMeta] = useState<Partial<CamiSong>>({ title: '', artist: 'CAMI', genre: '', album: '', status: 'draft', explicit: false })
  const uploadMut = useMutation({
    mutationFn: () => camiUpload(uploadFile!, uploadMeta),
    onSuccess: () => { setUploadFile(null); setUploadMeta({ title: '', artist: 'CAMI', genre: '', album: '', status: 'draft', explicit: false }); if (fileRef.current) fileRef.current.value = ''; invalidate(); setActiveTab('songs') },
  })

  const statusColor = (s: string) => s === 'published' ? 'text-success' : s === 'draft' ? 'text-warning' : 'text-muted'
  const statusText  = (s: string) => s === 'published' ? 'Publicado' : s === 'draft' ? 'Borrador' : 'Procesando'

  const totalPlays = stats?.totalPlays ?? songs.reduce((a, s) => a + s.plays, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-xl p-6 border border-purple-500/20">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-2xl font-bold text-bg">CAMI</div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-accent">Canal CAMI</h1>
            <p className="text-muted mt-1">Espacio profesional para música y creatividad</p>
            <div className="flex gap-4 mt-2 text-sm text-muted flex-wrap">
              <span>🎵 {stats?.totalSongs ?? songs.length} Canciones</span>
              <span>💿 {stats?.totalAlbums ?? albums.length} Álbumes</span>
              <span>👥 {totalPlays.toLocaleString()} Reproducciones</span>
              {stats && <span>📡 {stats.monthlyListeners.toLocaleString()} oyentes/mes</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[rgba(56,139,253,0.3)]">
        {([['songs','Canciones','🎵'],['albums','Álbumes','💿'],['upload','Subir','📤'],['analytics','Análisis','📊']] as const).map(([id,label,icon]) => (
          <button key={id} onClick={() => setActiveTab(id as Tab)}
            className={`px-4 py-2 font-medium transition ${activeTab === id ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-[#e6edf3]'}`}>
            <span className="mr-1">{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* ── CANCIONES ── */}
      {activeTab === 'songs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Gestión de Canciones</h2>
            <button onClick={() => setActiveTab('upload')}
              className="px-3 py-1.5 text-sm bg-accent text-bg rounded-lg hover:bg-accent/80 transition">
              ➕ Nueva canción
            </button>
          </div>

          {loadingSongs ? (
            <p className="text-muted text-sm">Cargando…</p>
          ) : songs.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">No hay canciones. Usa "Nueva canción" para subir una.</p>
          ) : (
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[rgba(56,139,253,0.1)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-accent">Título</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-accent">Álbum</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-accent">Duración</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-accent">Estado</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-accent">Reproducciones</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-accent">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(56,139,253,0.1)]">
                  {songs.map(song => (
                    <tr key={song.id} className="hover:bg-[rgba(56,139,253,0.05)] transition">
                      <td className="px-4 py-3">
                        {editing?.id === song.id ? (
                          <input autoFocus defaultValue={song.title} onBlur={e => setEditing({ ...editing, title: e.target.value })}
                            className="bg-bg border border-accent/50 rounded px-2 py-1 text-sm w-full focus:outline-none" />
                        ) : (
                          <div>
                            <div className="font-medium text-[#e6edf3] cursor-pointer" onClick={() => playMut.mutate(song.id)}>{song.title}</div>
                            <div className="text-xs text-muted">{song.artist}{song.genre ? ` • ${song.genre}` : ''}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{song.album || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted">{song.duration}</td>
                      <td className="px-4 py-3">
                        {editing?.id === song.id ? (
                          <select defaultValue={song.status} onChange={e => setEditing({ ...editing, status: e.target.value as CamiSong['status'] })}
                            className="bg-bg border border-accent/50 rounded px-2 py-1 text-sm focus:outline-none">
                            <option value="published">Publicado</option>
                            <option value="draft">Borrador</option>
                          </select>
                        ) : (
                          <span className={`text-sm font-medium ${statusColor(song.status)}`}>{statusText(song.status)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{song.plays.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {editing?.id === song.id ? (
                            <>
                              <button onClick={() => updateMut.mutate({ id: song.id, data: editing })}
                                className="px-2 py-1 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30 transition">
                                {updateMut.isPending ? '…' : '✓ Guardar'}
                              </button>
                              <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs text-muted hover:text-[#e6edf3] transition">✕</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditing(song)} className="p-1 text-muted hover:text-accent transition" title="Editar">✏️</button>
                              <button onClick={() => { if (confirm(`¿Eliminar "${song.title}"?`)) deleteMut.mutate(song.id) }}
                                className="p-1 text-muted hover:text-destructive transition" title="Eliminar">🗑️</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ÁLBUMES ── */}
      {activeTab === 'albums' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">Álbumes</h2>
            <div className="flex gap-2">
              <input value={newAlbumTitle} onChange={e => setNewAlbumTitle(e.target.value)}
                placeholder="Título del nuevo álbum"
                className="px-3 py-1.5 text-sm bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none" />
              <button onClick={() => newAlbumTitle.trim() && albumMut.mutate({ title: newAlbumTitle, artist: 'CAMI', status: 'draft', releaseDate: new Date().toISOString().split('T')[0], songCount: 0, coverImage: '' })}
                className="px-3 py-1.5 text-sm bg-accent text-bg rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
                disabled={!newAlbumTitle.trim() || albumMut.isPending}>
                {albumMut.isPending ? 'Creando…' : '➕ Crear'}
              </button>
            </div>
          </div>
          {loadingAlbums ? <p className="text-muted text-sm">Cargando…</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {albums.map(album => (
                <div key={album.id} className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4 hover:border-accent/50 transition">
                  <div className="aspect-square bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg mb-4 flex items-center justify-center">
                    <span className="text-4xl">💿</span>
                  </div>
                  <h3 className="font-semibold text-[#e6edf3]">{album.title}</h3>
                  <p className="text-sm text-muted mb-2">{album.artist}</p>
                  <div className="flex justify-between text-sm text-muted mb-3">
                    <span>{album.songCount} canciones</span>
                    <span>{album.releaseDate}</span>
                  </div>
                  <span className={`text-xs font-medium ${album.status === 'published' ? 'text-success' : 'text-warning'}`}>
                    {album.status === 'published' ? '● Publicado' : '○ Borrador'}
                  </span>
                </div>
              ))}
              {albums.length === 0 && <p className="text-muted text-sm col-span-3 text-center py-8">No hay álbumes aún.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── SUBIR ── */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Subir Nueva Música</h2>
          <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-6">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${uploadFile ? 'border-accent/70 bg-accent/5' : 'border-[rgba(56,139,253,0.3)] hover:border-accent/50'}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setUploadFile(f); if (!uploadMeta.title) setUploadMeta(m => ({ ...m, title: f.name.replace(/\.[^.]+$/, '') })) } }}>
              <div className="text-4xl mb-4">{uploadFile ? '🎵' : '📤'}</div>
              {uploadFile ? (
                <div>
                  <p className="font-medium text-[#e6edf3]">{uploadFile.name}</p>
                  <p className="text-sm text-muted mt-1">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  <button onClick={e => { e.stopPropagation(); setUploadFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="mt-2 text-xs text-muted hover:text-destructive transition">Cambiar archivo</button>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-[#e6edf3] mb-2">Arrastra tu archivo aquí</h3>
                  <p className="text-muted mb-4">o haz clic para seleccionar</p>
                  <p className="text-sm text-muted">MP3, WAV, FLAC, M4A · máx. 50 MB</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".mp3,.wav,.flac,.m4a,audio/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); if (!uploadMeta.title) setUploadMeta(m => ({ ...m, title: f.name.replace(/\.[^.]+$/, '') })) } }} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4 space-y-3">
              <h3 className="font-medium text-[#e6edf3]">Información de la canción</h3>
              <input value={uploadMeta.title || ''} onChange={e => setUploadMeta(m => ({ ...m, title: e.target.value }))}
                placeholder="Título *" className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none" />
              <input value={uploadMeta.artist || ''} onChange={e => setUploadMeta(m => ({ ...m, artist: e.target.value }))}
                placeholder="Artista" className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none" />
              <select value={uploadMeta.genre || ''} onChange={e => setUploadMeta(m => ({ ...m, genre: e.target.value }))}
                className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none">
                <option value="">Género (opcional)</option>
                {['Pop','Rock','Balada','Electrónica','Reggaeton','Salsa','Jazz','Clásica'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4 space-y-3">
              <h3 className="font-medium text-[#e6edf3]">Publicación</h3>
              <select value={uploadMeta.album || ''} onChange={e => setUploadMeta(m => ({ ...m, album: e.target.value }))}
                className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none">
                <option value="">Sin álbum</option>
                {albums.map(a => <option key={a.id} value={a.title}>{a.title}</option>)}
              </select>
              <select value={uploadMeta.status || 'draft'} onChange={e => setUploadMeta(m => ({ ...m, status: e.target.value as CamiSong['status'] }))}
                className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none">
                <option value="draft">Borrador</option>
                <option value="published">Publicar ahora</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={uploadMeta.explicit || false} onChange={e => setUploadMeta(m => ({ ...m, explicit: e.target.checked }))} className="rounded" />
                <span className="text-sm text-muted">Contenido explícito</span>
              </label>
            </div>
          </div>

          {uploadMut.isError && <p className="text-destructive text-sm">{(uploadMut.error as Error)?.message}</p>}
          {uploadMut.isSuccess && <p className="text-success text-sm">✓ Canción subida correctamente</p>}

          <div className="flex justify-end gap-3">
            <button onClick={() => setActiveTab('songs')} className="px-4 py-2 border border-[rgba(56,139,253,0.3)] rounded-lg hover:border-accent/50 transition">Cancelar</button>
            <button
              disabled={!uploadFile || !uploadMeta.title?.trim() || uploadMut.isPending}
              onClick={() => uploadMut.mutate()}
              className="px-4 py-2 bg-accent text-bg rounded-lg hover:bg-accent/80 transition disabled:opacity-50">
              {uploadMut.isPending ? 'Subiendo…' : 'Publicar canción'}
            </button>
          </div>
        </div>
      )}

      {/* ── ANÁLISIS ── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Análisis y Estadísticas</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['🎵', stats?.totalSongs ?? songs.length, 'Canciones'],
              ['👥', (stats?.totalPlays ?? totalPlays).toLocaleString(), 'Reproducciones'],
              ['💿', stats?.totalAlbums ?? albums.length, 'Álbumes'],
              ['📡', stats?.monthlyListeners?.toLocaleString() ?? '—', 'Oyentes/mes'],
            ].map(([icon, val, label]) => (
              <div key={label as string} className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-2xl font-bold text-accent">{val}</div>
                <div className="text-sm text-muted">{label}</div>
              </div>
            ))}
          </div>
          <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-6">
            <h3 className="font-medium text-[#e6edf3] mb-4">Canciones más populares</h3>
            {[...songs].sort((a, b) => b.plays - a.plays).map((song, i) => (
              <div key={song.id} className="flex items-center gap-4 py-2 border-b border-[rgba(56,139,253,0.1)] last:border-0">
                <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center text-sm font-medium text-accent">{i + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-[#e6edf3]">{song.title}</div>
                  <div className="text-sm text-muted">{song.artist}{song.genre ? ` · ${song.genre}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-accent">{song.plays.toLocaleString()}</div>
                  <div className="text-xs text-muted">reproducciones</div>
                </div>
              </div>
            ))}
            {songs.length === 0 && <p className="text-muted text-sm text-center py-4">Sin datos aún</p>}
          </div>
        </div>
      )}
    </div>
  )
}
