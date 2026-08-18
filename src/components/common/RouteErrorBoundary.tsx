import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientOperationalEvent } from '../../services/clientTelemetry';

type RouteErrorBoundaryState = { error: Error | null };

/**
 * A failure the size of one screen, instead of the size of the app.
 *
 * `AppErrorBoundary` wraps the whole router, which is right for the things that
 * can break everywhere - a bad chunk after a deploy, a corrupt session. But it
 * was also catching a crash inside one destination, and replacing the entire
 * workspace with a full-page apology: rail gone, tab bar gone, the other twenty
 * surfaces gone, and the only way on was a reload of a page that would crash
 * again the moment it finished loading.
 *
 * That is a bad trade for an operator who was three clicks into their morning.
 * Every other destination reads the same records and almost certainly still
 * works; the one that broke is one row of the rail away from the one that
 * doesn't. So this sits inside the shell, around the outlet only, and leaves
 * the navigation alive so the answer to a broken screen is to go somewhere
 * else rather than to start again.
 *
 * It is remounted with `key={pathname}` by the shell, which is how it resets:
 * navigating away and back is the retry, and there is no stale error left
 * behind on a route the operator has already left.
 *
 * The whole-app boundary stays where it is. This one cannot catch what happens
 * outside the outlet, and the chunk-load error after a deploy is exactly that.
 */
export class RouteErrorBoundary extends Component<{ route: string; children: ReactNode }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientOperationalEvent({
      eventName: 'client_render_error',
      component: 'RouteErrorBoundary',
      // The route is the useful part here: "Cost analysis broke" is actionable
      // in a way that "a screen broke" is not.
      operation: this.props.route || info.componentStack?.split('\n')[1]?.trim() || 'render',
      severity: 'error',
      error,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div role="alert" className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-navy">This screen could not be shown</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Nothing you have saved is affected, and the rest of your workspace is still working — pick
            another destination from the menu, or try this one again.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-white hover:bg-navy/90"
            >
              Try again
            </button>
            <a
              href="/app/today"
              className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Go to Today
            </a>
          </div>
        </div>
      </div>
    );
  }
}
