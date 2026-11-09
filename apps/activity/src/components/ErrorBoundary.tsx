import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('almost-you: render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="boot">
        <div className="boot__card">
          <p className="boot__error">{i18n.t('app.errorTitle')}</p>
          <p className="boot__tagline">{i18n.t('errors.generic')}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            {i18n.t('app.reload')}
          </button>
        </div>
      </div>
    );
  }
}
