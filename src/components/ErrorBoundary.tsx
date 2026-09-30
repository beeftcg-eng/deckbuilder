import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../shared/i18n'
import { lazyModal } from './lazyModal'

const BugReportModal = lazyModal(() => import('./BugReportModal'), 'BugReportModal')

interface Props {
  /** Names the part of the screen in the log line, e.g. "deck" or "sidebar". */
  area: string
  /** Changing it clears a caught error, e.g. the open deck's id, so picking another deck tries again. */
  resetKey?: unknown
  children: ReactNode
}

interface State {
  error: Error | null
  resetKey: unknown
}

/**
 * Keeps a render error in one part of the screen (a panel, the sidebar) from blanking the whole window.
 * The error goes through console.error, so errorLog.ts records it and a bug report sends it along.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.area}] crashed:`, error, info.componentStack?.split('\n').slice(0, 6).join('\n'))
  }

  render() {
    if (this.state.error) return <CrashNotice error={this.state.error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

function CrashNotice({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [reporting, setReporting] = useState(false)
  return (
    <div className="crash-notice" role="alert">
      <h3>{t.crash.title}</h3>
      <p className="text-dim">{t.crash.body}</p>
      <code className="crash-message">{error.message}</code>
      <div className="crash-actions">
        <button className="btn btn-primary" onClick={onRetry}>
          {t.crash.retry}
        </button>
        <button className="btn" onClick={() => setReporting(true)}>
          {t.bugReport.link}
        </button>
      </div>
      {reporting && <BugReportModal onClose={() => setReporting(false)} />}
    </div>
  )
}
