import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface Song {
  id: string
  title: string
  artist: string
  duration: string
  uploadDate: string
  fileSize: string
  format: string
  status: 'published' | 'draft' | 'processing'
  plays: number
  genre?: string
  album?: string
}

interface Album {
  id: string
  title: string
  artist: string
  releaseDate: string
  coverImage: string
  songCount: number
  status: 'published' | 'draft'
}

export function CamiPage() {
  const [activeTab, setActiveTab] = useState<'songs' | 'albums' | 'upload' | 'analytics'>('songs')

  // Mock data - en producción vendría de la API
  const { data: songs = [] } = useQuery({
    queryKey: ['cami-songs'],
    queryFn: () => Promise.resolve<Song[]>([
      {
        id: '1',
        title: 'Mi Primera Canción',
        artist: 'CAMI',
        duration: '3:45',
        uploadDate: '2024-01-15',
        fileSize: '8.2 MB',
        format: 'MP3',
        status: 'published',
        plays: 1250,
        genre: 'Pop',
        album: 'Debut Album'
      },
      {
        id: '2',
        title: 'Noches de Luna',
        artist: 'CAMI',
        duration: '4:12',
        uploadDate: '2024-01-20',
        fileSize: '9.1 MB',
        format: 'MP3',
        status: 'published',
        plays: 890,
        genre: 'Balada',
        album: 'Debut Album'
      }
    ])
  })

  const { data: albums = [] } = useQuery({
    queryKey: ['cami-albums'],
    queryFn: () => Promise.resolve<Album[]>([
      {
        id: '1',
        title: 'Debut Album',
        artist: 'CAMI',
        releaseDate: '2024-02-01',
        coverImage: '/api/placeholder/300/300',
        songCount: 12,
        status: 'published'
      }
    ])
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'text-success'
      case 'draft': return 'text-warning'
      case 'processing': return 'text-muted'
      default: return 'text-muted'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'published': return 'Publicado'
      case 'draft': return 'Borrador'
      case 'processing': return 'Procesando'
      default: return 'Desconocido'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header del canal CAMI */}
      <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-xl p-6 border border-purple-500/20">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-2xl font-bold text-bg">
            CAMI
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-accent">CAMI Channel</h1>
            <p className="text-muted mt-1">Espacio profesional para música y creatividad</p>
            <div className="flex gap-4 mt-2 text-sm text-muted">
              <span>📚 {songs.length} Canciones</span>
              <span>💿 {albums.length} Álbumes</span>
              <span>👥 {songs.reduce((acc, song) => acc + song.plays, 0).toLocaleString()} Reproducciones</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-accent text-bg rounded-lg hover:bg-accent/80 transition">
              ⚙️ Configuración
            </button>
            <button className="px-4 py-2 border border-[rgba(56,139,253,0.3)] rounded-lg hover:border-accent/50 transition">
              📊 Estadísticas
            </button>
          </div>
        </div>
      </div>

      {/* Navegación de tabs */}
      <div className="flex gap-1 border-b border-[rgba(56,139,253,0.3)]">
        {[
          { id: 'songs', label: 'Canciones', icon: '🎵' },
          { id: 'albums', label: 'Álbumes', icon: '💿' },
          { id: 'upload', label: 'Subir', icon: '📤' },
          { id: 'analytics', label: 'Análisis', icon: '📊' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 font-medium transition ${
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent'
                : 'text-muted hover:text-[#e6edf3]'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de tabs */}
      {activeTab === 'songs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Gestión de Canciones</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-sm border border-[rgba(56,139,253,0.3)] rounded-lg hover:border-accent/50 transition">
                📥 Importar lote
              </button>
              <button 
                onClick={() => setActiveTab('upload')}
                className="px-3 py-1.5 text-sm bg-accent text-bg rounded-lg hover:bg-accent/80 transition"
              >
                ➕ Nueva canción
              </button>
            </div>
          </div>

          <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[rgba(56,139,253,0.1)]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">
                    <input type="checkbox" className="rounded" />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Título</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Álbum</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Duración</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Reproducciones</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-accent">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,139,253,0.1)]">
                {songs.map((song) => (
                  <tr key={song.id} className="hover:bg-[rgba(56,139,253,0.05)] transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-[#e6edf3]">{song.title}</div>
                        <div className="text-sm text-muted">{song.artist} • {song.genre}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{song.album || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted">{song.duration}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${getStatusColor(song.status)}`}>
                        {getStatusText(song.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{song.plays.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-muted">{song.uploadDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="p-1 text-muted hover:text-accent transition" title="Editar">
                          ✏️
                        </button>
                        <button className="p-1 text-muted hover:text-accent transition" title="Descargar">
                          ⬇️
                        </button>
                        <button className="p-1 text-muted hover:text-destructive transition" title="Eliminar">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'albums' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Álbumes</h2>
            <button className="px-3 py-1.5 text-sm bg-accent text-bg rounded-lg hover:bg-accent/80 transition">
              ➕ Nuevo álbum
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album) => (
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
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-1.5 text-sm bg-accent/20 text-accent rounded hover:bg-accent/30 transition">
                    Ver álbum
                  </button>
                  <button className="px-3 py-1.5 text-sm border border-[rgba(56,139,253,0.3)] rounded hover:border-accent/50 transition">
                    ⚙️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Subir Nueva Música</h2>
          
          <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-6">
            <div className="border-2 border-dashed border-[rgba(56,139,253,0.3)] rounded-lg p-8 text-center hover:border-accent/50 transition">
              <div className="text-4xl mb-4">🎵</div>
              <h3 className="text-lg font-medium text-[#e6edf3] mb-2">Arrastra tus archivos aquí</h3>
              <p className="text-muted mb-4">o haz clic para seleccionar</p>
              <p className="text-sm text-muted mb-4">Formatos soportados: MP3, WAV, FLAC, M4A (máx. 50MB)</p>
              <button className="px-4 py-2 bg-accent text-bg rounded-lg hover:bg-accent/80 transition">
                Seleccionar archivos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
              <h3 className="font-medium text-[#e6edf3] mb-3">Información de la canción</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Título de la canción"
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Artista"
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                />
                <select className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none">
                  <option value="">Seleccionar género</option>
                  <option value="pop">Pop</option>
                  <option value="rock">Rock</option>
                  <option value="balada">Balada</option>
                  <option value="electronic">Electrónica</option>
                </select>
                <textarea
                  placeholder="Descripción"
                  rows={3}
                  className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
              <h3 className="font-medium text-[#e6edf3] mb-3">Configuración de publicación</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-muted mb-1">Álbum</label>
                  <select className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none">
                    <option value="">Sin álbum</option>
                    <option value="1">Debut Album</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Número de pista</label>
                  <input
                    type="number"
                    placeholder="1"
                    className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Estado</label>
                  <select className="w-full px-3 py-2 bg-bg border border-[rgba(56,139,253,0.3)] rounded-lg focus:border-accent/50 focus:outline-none">
                    <option value="draft">Borrador</option>
                    <option value="published">Publicado</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="explicit" className="rounded" />
                  <label htmlFor="explicit" className="text-sm text-muted">Contenido explícito</label>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button className="px-4 py-2 border border-[rgba(56,139,253,0.3)] rounded-lg hover:border-accent/50 transition">
              Guardar borrador
            </button>
            <button className="px-4 py-2 bg-accent text-bg rounded-lg hover:bg-accent/80 transition">
              Publicar canción
            </button>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Análisis y Estadísticas</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
              <div className="text-2xl mb-2">🎵</div>
              <div className="text-2xl font-bold text-accent">{songs.length}</div>
              <div className="text-sm text-muted">Canciones totales</div>
            </div>
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
              <div className="text-2xl mb-2">👥</div>
              <div className="text-2xl font-bold text-accent">{songs.reduce((acc, song) => acc + song.plays, 0).toLocaleString()}</div>
              <div className="text-sm text-muted">Reproducciones totales</div>
            </div>
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
              <div className="text-2xl mb-2">💿</div>
              <div className="text-2xl font-bold text-accent">{albums.length}</div>
              <div className="text-sm text-muted">Álbumes publicados</div>
            </div>
            <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-4">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-2xl font-bold text-accent">98%</div>
              <div className="text-sm text-muted">Tasa de engagement</div>
            </div>
          </div>

          <div className="bg-[rgba(22,27,34,0.5)] rounded-lg border border-[rgba(56,139,253,0.3)] p-6">
            <h3 className="font-medium text-[#e6edf3] mb-4">Canciones más populares</h3>
            <div className="space-y-3">
              {songs.sort((a, b) => b.plays - a.plays).map((song, index) => (
                <div key={song.id} className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center text-sm font-medium text-accent">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-[#e6edf3]">{song.title}</div>
                    <div className="text-sm text-muted">{song.artist}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-accent">{song.plays.toLocaleString()}</div>
                    <div className="text-sm text-muted">reproducciones</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
