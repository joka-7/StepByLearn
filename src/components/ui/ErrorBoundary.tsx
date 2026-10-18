import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one bad component shows a recovery screen instead
 * of blanking the whole app. A class component because React only exposes
 * error boundaries through class lifecycle methods.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error", { name: error.name, stack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"
      >
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="text-sm text-slate-300">
            Your courses are still saved in this browser. Reloading usually fixes this.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-sm"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
