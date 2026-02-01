import { useEffect } from 'react'

type Props = {
  version: string
  changelog: string
  onUpdate: () => void
  onLater: () => void
}

export function UpdateModal({ version, changelog, onUpdate, onLater }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLater()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onLater])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
    >
      <div className="bg-[#161b22] border border-[rgba(56,139,253,0.3)] rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-[rgba(56,139,253,0.2)]">
          <h2 id="update-modal-title" className="text-lg font-semibold text-accent">
            Actualización disponible
          </h2>
          <p className="text-sm text-muted mt-1">Versión {version}</p>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <pre className="text-xs text-[#e6edf3] whitespace-pre-wrap font-sans">
            {changelog}
          </pre>
        </div>
        <div className="p-4 border-t border-[rgba(56,139,253,0.2)] flex gap-2 justify-end">
          <button
            type="button"
            onClick={onLater}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-[#e6edf3] transition"
          >
            Más tarde
          </button>
          <button
            type="button"
            onClick={onUpdate}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-[#0d1117] hover:opacity-90 transition"
          >
            Actualizar ahora
          </button>
        </div>
      </div>
    </div>
  )
}
