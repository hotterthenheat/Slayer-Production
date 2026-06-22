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
    // Surface to console (and any future telemetry sink) without crashing the shell.
    console.error(`[ErrorBoundary${this.props.label ? ' · ' + this.props.label : ''}]`, error, info?.componentStack);
  }

  private reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'An unexpected error occurred in this panel.';
    return (
      <div className="w-full min-h-[240px] flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-black/80 border border-rose-500/30 rounded-lg p-6 text-center font-mono">
          <div className="text-[10px] uppercase tracking-[0.25em] text-rose-400/80 mb-3">
             Subsystem Fault{this.props.label ? ` · ${this.props.label}` : ''}
          </div>
          <p className="text-zinc-400 text-xs mb-1">
            This panel hit an error and was isolated to keep the rest of the terminal running.
          </p>
          <p className="text-zinc-600 text-[10px] mb-5 break-words">{msg}</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={this.reset}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-md bg-white text-black hover:opacity-90 transition"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition"
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
