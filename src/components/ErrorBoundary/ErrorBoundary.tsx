import { Component, type ErrorInfo, type ReactNode } from "react";

import "./ErrorBoundary.css";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/** Keeps a render failure from leaving the application window blank. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // The details are useful for diagnostics; the user-facing fallback never
    // exposes internal messages or repository data.
    console.error(
      "Uncaught application render error",
      error,
      info.componentStack,
    );
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary" role="alert">
          <section className="error-boundary__card">
            <h1 className="error-boundary__title">
              GitCanvas encontró un problema
            </h1>
            <p className="error-boundary__message">
              La aplicación no pudo mostrar esta vista. Reinicia GitCanvas para
              continuar.
            </p>
            <button
              className="button"
              type="button"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reiniciar GitCanvas
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
