import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}] Caught error:`, error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-surface-0">
          <div className="w-12 h-12 rounded-xl bg-danger-muted flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-danger text-base font-medium mb-2">
            Something went wrong
          </div>
          <div className="text-text-muted text-sm mb-2 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <div className="text-text-tertiary text-xs mb-4 max-w-md">
            Try again below. If this keeps happening, reload the window (Cmd+R) or restart the app.
          </div>
          <button
            onClick={this.handleRetry}
            className="btn btn-secondary"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
