import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Short label shown in the fallback + console (e.g. the panel name). */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Isolates a render/runtime error to the wrapped subtree
 * so a single failing panel can't white-screen the whole terminal. Error
 * boundaries must be class components.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to console without crashing the shell.
    console.error(`[ErrorBoundary${this.props.label ? ' · ' + this.props.label : ''}]`, error, info?.componentStack);
    // Best-effort telemetry: report to the backend sink (which can forward to
    // Sentry/Datadog/etc.) and to an optional client-side hook. Never throws.
    try {
      const payload = {
        message: error?.message || String(error),
        stack: error?.stack || null,
        componentStack: info?.componentStack || null,
        label: this.props.label || null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        ts: new Date().toISOString(),
      };
      (window as any).__slayerOnError?.(payload);
      if (typeof fetch === 'function') {
        fetch('/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* telemetry must never break the fallback UI */
    }
  }

  private reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'An unexpected error occurred in this panel.';
    return (
      <div className="w-full min-h-[240px] flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--danger)]/30 rounded-xl p-6 text-center">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--danger)] mb-3 font-mono">
            Subsystem Fault{this.props.label ? ` · ${this.props.label}` : ''}
          </div>
          <p className="text-[var(--text-secondary)] text-xs mb-1 leading-relaxed">
            This panel hit an error and was isolated to keep the rest of the terminal running.
          </p>
          <p className="text-[var(--text-tertiary)] text-[10px] mb-5 break-words font-mono">{msg}</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={this.reset}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-md bg-[var(--text-primary)] text-[var(--surface)] hover:opacity-90 transition focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            >
              Reload Terminal
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
