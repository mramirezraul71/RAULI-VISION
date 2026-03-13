import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { noticias, noticiasFeeds, noticiasByFeed, type NewsArticle } from '../api/client'

const CATEGORIES = [
  { id: 'cuba',          label: 'Cuba',          icon: '🇨🇺' },
  { id: 'internacional', label: 'Internacional',  icon: '🌍' },
  { id: 'tecnologia',    label: 'Tecnología',     icon: '💻' },
]

function timeAgo(pubDate: string): string {
  try {
    const d = new Date(pubDate)
    if (isNaN(d.getTime())) return pubDate
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60)  return `hace ${mins}m`
    const hs = Math.floor(mins / 60)
    if (hs < 24)    return `hace ${hs}h`
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  } catch { return pubDate }
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const [imgError, setImgError] = useState(false)

  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 p-3 rounded-xl border border-[rgba(56,139,253,0.15)] bg-[rgba(22,27,34,0.6)] hover:border-accent/40 hover:bg-[rgba(22,27,34,0.9)] transition-all"
    >
      {/* Imagen */}
      {article.image_url && !imgError && (
        <div className="flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden bg-[rgba(56,139,253,0.05)]">
          <img
            src={article.image_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent/80 font-medium">
            {article.source}
          </span>
          <span className="text-muted/50 text-xs">{timeAgo(article.pub_date)}</span>
        </div>
        <h3 className="text-sm text-[#e6edf3] font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {article.title}
        </h3>
        {article.description && (
          <p className="text-xs text-muted/70 leading-relaxed line-clamp-2">{article.description}</p>
        )}
      </div>

      <div className="flex-shrink-0 text-muted/30 group-hover:text-accent/50 transition-colors self-center text-xs">→</div>
    </a>
  )
}

export function NoticiasPage() {
  const [category, setCategory] = useState('cuba')
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null)

  const { data: feedsData } = useQuery({
    queryKey: ['noticiasFeeds'],
    queryFn: noticiasFeeds,
    staleTime: Infinity,
  })

  const feedsForCategory = (feedsData?.feeds ?? []).filter(f => f.category === category)

  const { data, isLoading, error, refetch } = useQuery<{ articles: NewsArticle[]; total: number } & Record<string, unknown>>({
    queryKey: ['noticias', category, selectedFeed],
    queryFn: () => selectedFeed ? noticiasByFeed(selectedFeed, 30) as Promise<{ articles: NewsArticle[]; total: number } & Record<string, unknown>> : noticias(category, 40) as Promise<{ articles: NewsArticle[]; total: number } & Record<string, unknown>>,
    staleTime: 20 * 60_000,
  })

  const articles: NewsArticle[] = (data as any)?.articles ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#e6edf3]">Noticias</h2>
          <p className="text-muted text-sm mt-0.5">Fuentes RSS curadas</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-2 rounded-lg border border-[rgba(56,139,253,0.3)] text-muted hover:text-accent transition disabled:opacity-50"
          title="Actualizar"
        >
          {isLoading ? <span className="h-4 w-4 rounded-full border-2 border-muted border-t-transparent animate-spin inline-block" /> : '↻'}
        </button>
      </div>

      {/* Tabs de categoría */}
      <div className="flex gap-1.5">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setCategory(cat.id); setSelectedFeed(null) }}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1 ${
              category === cat.id
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-[rgba(22,27,34,0.5)] text-muted border border-[rgba(56,139,253,0.15)] hover:text-[#e6edf3]'
            }`}
          >
            <span>{cat.icon}</span>
            <span className="hidden sm:inline">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Chips de fuentes */}
      {feedsForCategory.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedFeed(null)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs transition ${
              !selectedFeed
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-[rgba(22,27,34,0.5)] text-muted border border-[rgba(56,139,253,0.15)] hover:text-[#e6edf3]'
            }`}
          >
            Todas
          </button>
          {feedsForCategory.map(f => (
            <button
              key={f.key}
              onClick={() => setSelectedFeed(f.key === selectedFeed ? null : f.key)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs transition ${
                selectedFeed === f.key
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-[rgba(22,27,34,0.5)] text-muted border border-[rgba(56,139,253,0.15)] hover:text-[#e6edf3]'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          Error cargando noticias — {String(error)}
        </div>
      )}

      {/* Skeleton */}
      {isLoading && articles.length === 0 && (
        <div className="space-y-2 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[rgba(56,139,253,0.05)] border border-[rgba(56,139,253,0.1)]" />
          ))}
        </div>
      )}

      {/* Artículos */}
      {articles.length > 0 && (
        <div className="space-y-2">
          {articles.map((a, i) => <ArticleCard key={`${a.source_key}-${i}`} article={a} />)}
        </div>
      )}

      {!isLoading && articles.length === 0 && !error && (
        <div className="text-center py-10 text-muted">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">Sin artículos disponibles</p>
          <button onClick={() => refetch()} className="mt-3 text-xs text-accent hover:underline">Reintentar</button>
        </div>
      )}

      {articles.length > 0 && (
        <div className="text-center text-muted/50 text-xs pt-2">{articles.length} artículos · RSS público</div>
      )}
    </div>
  )
}
