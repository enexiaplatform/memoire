import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientOperationalEvent } from '../../services/clientTelemetry';

type AppErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientOperationalEvent({
      eventName: 'client_render_error',
      component: 'AppErrorBoundary',
      operation: info.componentStack?.split('\n')[1]?.trim() || 'render',
      severity: 'error',
      error,
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const staleDeploy = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
      `${error.name} ${error.message}`,
    );

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div role="alert" className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Memoire</p>
          <h1 className="mt-2 text-xl font-bold text-navy">
            {staleDeploy ? 'A newer version of Memoire is available' : 'Something went wrong on this screen'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            {staleDeploy
              ? 'The app was updated while this page was open. Reload to get the latest version.'
              : 'Your saved data is not affected. Reload this page or return to Today to continue working.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-white hover:bg-navy/90"
            >
              Reload page
            </button>
            {!staleDeploy && (
              <a
                href="/app/today"
                className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Go to Today
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
}
