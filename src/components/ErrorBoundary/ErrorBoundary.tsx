import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import "./ErrorBoundary.css";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/** The recovery screen, translated; a hook cannot live in the class itself. */
function ErrorFallback() {
  const { t } = useTranslation("shell");

  return (
    <main className="error-boundary" role="alert">
      <section className="error-boundary__card">
        <h1 className="error-boundary__title">{t("errorBoundary.title")}</h1>
        <p className="error-boundary__message">{t("errorBoundary.message")}</p>
        <button
          className="button"
          type="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t("errorBoundary.restart")}
        </button>
      </section>
    </main>
  );
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
    if (this.state.hasError) return <ErrorFallback />;

    return this.props.children;
  }
}
