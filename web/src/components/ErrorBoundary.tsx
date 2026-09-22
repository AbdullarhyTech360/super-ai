import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown instead of the generic card when the app wants a lighter fallback. */
  fallback?: ReactNode;
  /** Called with the original error so a page can log or report it. */
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a render-time crash in one route from blanking the whole app. Without
 * it, an exception anywhere below this point unmounts the tree and leaves the
 * user on a white screen with no way back.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
    this.props.onError?.(error);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-modern">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This screen hit an unexpected error. Your conversations are safe — try reloading.
          </p>
          <p className="mt-3 break-words text-xs text-muted-foreground/80">
            {error.message || 'Unknown error'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Try again
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
