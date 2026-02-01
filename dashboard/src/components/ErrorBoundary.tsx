import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-red-400 font-medium">Algo falló</p>
          <p className="text-muted text-sm text-center max-w-md">
            Recargue la página o intente más tarde. Si el problema continúa, compruebe la conexión con el proxy.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="rounded-lg bg-accent/20 text-accent px-4 py-2 text-sm font-medium hover:bg-accent/30"
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
