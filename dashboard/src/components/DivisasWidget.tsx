import { useQuery } from '@tanstack/react-query'

interface Rate {
  currency: string
  buy_cup: number
  sell_cup: number
  trend: 'up' | 'down' | 'stable'
}

interface DivisasResponse {
  ok: boolean
  rates: Rate[]
  cached_at: string
}

async function fetchDivisas(): Promise<DivisasResponse> {
  const r = await fetch('/api/divisas')
  if (!r.ok) throw new Error('divisas_error')
  return r.json()
}

const trendIcon = (t: string) =>
  t === 'up' ? '↑' : t === 'down' ? '↓' : ''

const trendColor = (t: string) =>
  t === 'up' ? 'text-red-400' : t === 'down' ? 'text-green-400' : 'text-muted/60'

export function DivisasWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['divisas'],
    queryFn: fetchDivisas,
    refetchInterval: 15 * 60 * 1000, // cada 15 min (caché backend es 4h)
    retry: 1,
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-muted/50 animate-pulse">
        <span>USD —</span>
        <span>EUR —</span>
        <span>MLC —</span>
      </div>
    )
  }

  if (isError || !data?.ok || !data.rates?.length) return null

  return (
    <div className="flex items-center gap-2.5" title="Tasas informales CUP — Fuente: elToque">
      {data.rates.map((r) => (
        <span key={r.currency} className="flex items-center gap-0.5">
          <span className="text-[10px] font-medium text-muted/70">{r.currency}</span>
          <span className="text-[11px] font-semibold text-[#e6edf3]">
            {r.sell_cup > 0 ? r.sell_cup.toFixed(0) : '—'}
          </span>
          <span className={`text-[10px] font-bold leading-none ${trendColor(r.trend)}`}>
            {trendIcon(r.trend)}
          </span>
        </span>
      ))}
    </div>
  )
}
