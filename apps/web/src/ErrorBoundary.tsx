import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Top-level error boundary. A render throw (an unexpected API shape, a bug deep in a component) must NOT
 * blank the whole wallet to a white screen — that is neither an honest error state (Doctrine #3) nor
 * Apple-grade craft (#6), and it strands the user with no recovery. This catches the throw and shows a
 * recoverable, on-brand error state that tells the truth: nothing was sent, the encrypted vault is
 * untouched (a render crash is not data loss), and a reload re-mounts the app (re-locking to the unlock
 * screen). The error is logged locally for debugging and sent NOWHERE — a render error can close over app
 * state, so it must never leave the device.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] unhandled render error', error.message, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="app-error" role="alert">
          <div className="app-error-card">
            <h1 className="app-error-title">Something went wrong</h1>
            <p className="app-error-lead">
              The app hit an unexpected error and stopped to keep you safe. <b>Nothing was sent</b>, and your
              wallet and recovery phrase are untouched. Reload to continue.
            </p>
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
