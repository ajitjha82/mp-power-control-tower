import { Component, type ReactNode } from 'react'
import { ErrorState } from './states'

/** Catches render / lazy-chunk failures for a route so the shell stays usable. */
export class RouteErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error)
      return (
        <div className="rounded-lg border bg-card">
          <ErrorState error={this.state.error} onRetry={() => window.location.reload()} />
        </div>
      )
    return this.props.children
  }
}
