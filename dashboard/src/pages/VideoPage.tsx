import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { videoSearch, videoMeta, videoRequest, videoStatus } from '../api/client'

function Skeleton() {
  return (
    <div className="animate-pulse grid gap-3 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 rounded-lg bg-[rgba(48,54,61,0.4)]" />
      ))}
    </div>
  )
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VideoPage() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: list, isFetching: listLoading } = useQuery({
    queryKey: ['videoSearch', query],
    queryFn: () => videoSearch(query, 15),
    enabled: query.length > 0,
  })

  const { data: meta } = useQuery({
    queryKey: ['videoMeta', selectedId],
    queryFn: () => videoMeta(selectedId!),
    enabled: !!selectedId,
  })

  const requestMutation = useMutation({
    mutationFn: ({ id, quality }: { id: string; quality: string }) => videoRequest(id, quality),
    onSuccess: (_, { id }) => {
      setJobId(_.job_id)
      queryClient.invalidateQueries({ queryKey: ['videoMeta', id] })
    },
  })

  const { data: status } = useQuery({
    queryKey: ['videoStatus', selectedId, jobId],
    queryFn: () => videoStatus(selectedId!, jobId!),
    enabled: !!selectedId && !!jobId,
    refetchInterval: (query) => {
      const d = (query as { state?: { data?: { status?: string } } }).state?.data
      return d?.status === 'ready' || d?.status === 'failed' ? false : 2000
    },
  })

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        <h2 className="text-accent font-semibold mb-3">Videos (curado/comprimido)</h2>
        <p className="text-muted text-sm mb-4">Busque; al elegir uno puede solicitar preparación para ver o descargar más tarde.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(q.trim())
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar videos..."
            className="flex-1 rounded-lg border border-[rgba(56,139,253,0.3)] bg-[#0d1117] px-4 py-2.5 text-[#e6edf3] placeholder-muted focus:border-accent focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-accent/20 text-accent px-4 py-2.5 font-medium hover:bg-accent/30 transition">
            Buscar
          </button>
        </form>
      </section>
      <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
        {query && listLoading && <Skeleton />}
        {query && list && (
          <ul className="space-y-2">
            {list.results.map((v) => (
              <li
                key={v.id}
                className={`rounded-lg border p-3 cursor-pointer transition ${selectedId === v.id ? 'border-accent bg-accent/10' : 'border-[rgba(56,139,253,0.2)] hover:border-accent/50'}`}
                onClick={() => {
                  setSelectedId(v.id)
                  setJobId(null)
                }}
              >
                <span className="font-medium block truncate">{v.title}</span>
                <span className="text-muted text-sm">{v.channel} · {formatDuration(v.duration_sec)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selectedId && meta && (
        <section className="rounded-xl border border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.85)] p-5 backdrop-blur">
          <h3 className="text-accent font-semibold mb-2">{meta.title}</h3>
          <p className="text-muted text-sm mb-3">Calidades: {meta.qualities.join(', ')} · {meta.ready ? 'Listo' : 'No listo'}</p>
          {!meta.ready && (
            <button
              onClick={() => requestMutation.mutate({ id: selectedId, quality: '360p' })}
              disabled={requestMutation.isPending}
              className="rounded-lg bg-accent/20 text-accent px-4 py-2 font-medium hover:bg-accent/30 disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Solicitando…' : 'Solicitar preparación (360p)'}
            </button>
          )}
          {jobId && status && (
            <p className="mt-2 text-sm text-muted">
              Estado: {status.status} {status.progress_percent > 0 && `· ${status.progress_percent}%`}
              {status.status === 'ready' && ' · Listo para ver/descargar'}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
