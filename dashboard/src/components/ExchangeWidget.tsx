import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

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

function userToken(): string {
  try { return localStorage.getItem('rauli_user_token') ?? '' } catch { return '' }
}

async function fetchDivisas(): Promise<DivisasResponse> {
  const u = userToken()
  const url = u ? `/api/divisas?u=${encodeURIComponent(u)}` : '/api/divisas'
  const r = await fetch(url)
  if (!r.ok) throw new Error('divisas_error')
  return r.json()
}

export function ExchangeWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['divisas'],
    queryFn: fetchDivisas,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
        <div className="text-[10px] font-semibold text-[#00f2ff] uppercase tracking-wider mb-3">Divisas</div>
        <div className="grid grid-cols-3 gap-2">
          {['USD', 'EUR', 'MLC'].map((c) => (
            <div key={c} className="bg-black/20 rounded-xl p-3 flex flex-col items-center gap-1.5 animate-pulse">
              <span className="text-[11px] text-[#00f2ff]/50">{c}</span>
              <span className="w-10 h-5 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data?.ok || !data.rates?.length) return null

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-[#00f2ff] uppercase tracking-wider">Divisas CUP</span>
        <span className="text-[9px] text-white/25">elToque</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {data.rates.map((r) => {
          const TrendIcon =
            r.trend === 'up' ? TrendingUp : r.trend === 'down' ? TrendingDown : Minus
          const trendClass =
            r.trend === 'up'
              ? 'text-red-400'
              : r.trend === 'down'
              ? 'text-emerald-400'
              : 'text-white/20'
          return (
            <div
              key={r.currency}
              className="bg-black/20 rounded-xl p-3 flex flex-col items-center gap-1"
            >
              <span className="text-[11px] font-medium text-[#00f2ff]">{r.currency}</span>
              <span className="text-xl font-bold font-mono text-white leading-none">
                {r.sell_cup > 0 ? r.sell_cup.toFixed(0) : '—'}
              </span>
              <TrendIcon size={11} className={trendClass} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
