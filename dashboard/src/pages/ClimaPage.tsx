import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { climaByCity, climaCities } from '../api/client'

function wmoDesc(code: number): { emoji: string; label: string } {
  if (code === 0)                  return { emoji: '☀️',  label: 'Despejado' }
  if (code <= 2)                   return { emoji: '🌤️', label: 'Parcialmente nublado' }
  if (code === 3)                  return { emoji: '☁️',  label: 'Nublado' }
  if (code <= 49)                  return { emoji: '🌫️', label: 'Niebla' }
  if (code <= 57)                  return { emoji: '🌧️', label: 'Llovizna' }
  if (code <= 65)                  return { emoji: '🌧️', label: 'Lluvia' }
  if (code <= 77)                  return { emoji: '❄️',  label: 'Nieve' }
  if (code <= 82)                  return { emoji: '🌦️', label: 'Chubascos' }
  if (code <= 86)                  return { emoji: '🌨️', label: 'Nieve intensa' }
  if (code <= 99)                  return { emoji: '⛈️',  label: 'Tormenta' }
  return { emoji: '🌡️', label: 'Desconocido' }
}

function windDirLabel(deg: number): string {
  const dirs = ['N','NE','E','SE','S','SO','O','NO']
  return dirs[Math.round(deg / 45) % 8]
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

export function ClimaPage() {
  const [city, setCity] = useState('La Habana')

  const { data: citiesData } = useQuery({
    queryKey: ['climaCities'],
    queryFn: climaCities,
    staleTime: Infinity,
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clima', city],
    queryFn: () => climaByCity(city),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  })

  const { emoji, label } = data ? wmoDesc(data.current.weather_code) : { emoji: '🌡️', label: '' }
  const isDay = data ? data.current.is_day === 1 : true

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#e6edf3]">Clima</h2>
        <p className="text-muted text-sm mt-0.5">Pronóstico del tiempo · Open-Meteo</p>
      </div>

      {/* Selector de ciudad */}
      <div className="flex gap-2">
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          className="flex-1 bg-[rgba(22,27,34,0.8)] border border-[rgba(56,139,253,0.3)] text-[#e6edf3] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/70"
        >
          {(citiesData?.cities ?? ['La Habana']).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-3 py-2 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded-lg text-sm transition disabled:opacity-50"
        >
          {isLoading ? <span className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" /> : '↻'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          Error obteniendo el clima: {String(error)}
        </div>
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-[rgba(56,139,253,0.05)] border border-[rgba(56,139,253,0.1)]" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Clima actual */}
          <div className={`rounded-xl border p-5 ${isDay ? 'border-[rgba(56,139,253,0.3)] bg-[rgba(22,27,34,0.8)]' : 'border-[rgba(56,139,253,0.2)] bg-[rgba(13,17,23,0.9)]'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-5xl mb-2">{emoji}</div>
                <div className="text-5xl font-light text-[#e6edf3]">
                  {Math.round(data.current.temperature_2m)}°C
                </div>
                <div className="text-muted text-sm mt-1">{label}</div>
                <div className="text-muted text-xs mt-0.5">
                  Sensación: {Math.round(data.current.apparent_temperature)}°C
                </div>
              </div>
              <div className="text-right">
                <div className="text-accent font-semibold text-lg">{data.city}</div>
                <div className="text-muted text-xs mt-1">{data.timezone}</div>
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border ${isDay ? 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10' : 'text-blue-400 border-blue-400/40 bg-blue-400/10'}`}>
                  {isDay ? '☀️ Día' : '🌙 Noche'}
                </span>
              </div>
            </div>

            {/* Detalles */}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[rgba(56,139,253,0.15)]">
              <div className="text-center">
                <div className="text-xl">💧</div>
                <div className="text-[#e6edf3] font-medium text-sm">{data.current.relative_humidity_2m}%</div>
                <div className="text-muted text-xs">Humedad</div>
              </div>
              <div className="text-center">
                <div className="text-xl">💨</div>
                <div className="text-[#e6edf3] font-medium text-sm">{Math.round(data.current.wind_speed_10m)} km/h</div>
                <div className="text-muted text-xs">{windDirLabel(data.current.wind_direction_10m)}</div>
              </div>
              <div className="text-center">
                <div className="text-xl">🌧️</div>
                <div className="text-[#e6edf3] font-medium text-sm">{data.current.precipitation} mm</div>
                <div className="text-muted text-xs">Precipitación</div>
              </div>
            </div>
          </div>

          {/* Pronóstico 7 días */}
          <div>
            <h3 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Pronóstico 7 días</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.daily.map((day, i) => {
                const { emoji: de, label: dl } = wmoDesc(day.weather_code)
                return (
                  <div
                    key={day.date}
                    className={`flex-shrink-0 w-[90px] rounded-xl border p-3 text-center ${i === 0 ? 'border-accent/40 bg-accent/10' : 'border-[rgba(56,139,253,0.15)] bg-[rgba(22,27,34,0.5)]'}`}
                  >
                    <div className="text-muted text-xs font-medium mb-1">
                      {i === 0 ? 'Hoy' : fmtDate(day.date)}
                    </div>
                    <div className="text-2xl mb-1">{de}</div>
                    <div className="text-[#e6edf3] text-xs font-semibold">{Math.round(day.temp_max)}°</div>
                    <div className="text-muted text-xs">{Math.round(day.temp_min)}°</div>
                    {day.precip_sum > 0.1 && (
                      <div className="text-blue-400 text-xs mt-1">💧{day.precip_sum.toFixed(1)}</div>
                    )}
                    <div className="text-muted text-[9px] mt-1 leading-tight">{dl}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-center text-muted text-xs pt-2 border-t border-[rgba(56,139,253,0.1)]">
            Datos: <span className="text-accent/70">Open-Meteo.com</span> · Actualizado: {new Date(data.fetched_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </>
      )}
    </div>
  )
}
