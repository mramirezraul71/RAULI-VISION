import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { search } from '../api/client'

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg bg-[rgba(48,54,61,0.4)]" />
      ))}
    </div>
  )
}

export function SearchPage() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query, 20),
    enabled: query.length > 0,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setQuery(q.trim())
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <h2 className="text-accent font-semibold mb-3">Búsqueda optimizada</h2>
        <p className="text-muted text-sm mb-4">El servidor extrae solo texto y enlaces; respuesta ultra-ligera.</p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="flex-1 rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-accent/20 text-accent px-4 py-2.5 font-medium hover:bg-accent/30 transition">
            Buscar
          </button>
        </form>
      </section>
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        {!query && <p className="text-muted text-sm">Escriba algo y pulse Buscar.</p>}
        {query && isFetching && <Skeleton />}
        {query && isError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="text-red-400 font-medium">{(error as Error).message}</p>
            <p className="text-muted mt-2 text-xs">
              Para búsqueda real: ejecute Espejo (puerto 8080) y Proxy (puerto 3000), por ejemplo con <code className="bg-black/30 px-1 rounded">.\scripts\run-all.ps1</code>.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-3 rounded-lg bg-accent/20 text-accent px-4 py-2 text-sm font-medium hover:bg-accent/30 transition disabled:opacity-50"
            >
              {isFetching ? 'Buscando…' : 'Reintentar'}
            </button>
          </div>
        )}
        {query && data && (
          <>
            <p className="text-muted text-sm mb-3">
              Resultados para «{data.query}» {data.cached && '(desde caché)'}
            </p>
            <ul className="space-y-2">
              {data.results.map((r, i) => (
                <li key={i} className="rounded-lg border border-[rgba(56,139,253,0.2)] p-3 hover:border-accent/50 transition">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent font-medium block truncate">
                    {r.title}
                  </a>
                  {r.snippet && <p className="text-muted text-sm mt-1 line-clamp-2">{r.snippet}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
