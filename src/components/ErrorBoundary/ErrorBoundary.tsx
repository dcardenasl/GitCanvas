import { useState, Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { restartApplication } from "../../lib/ipc";
import { useWorkspace } from "../../state/workspace";
import { ErrorMessage } from "../ErrorMessage";
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
  const writing = useWorkspace((state) =>
    state.tabs.some((tab) => tab.gitActions.running !== null),
  );
  const [restarting, setRestarting] = useState(false);
  const [failure, setFailure] = useState<{ readonly cause: unknown } | null>(
    null,
  );

  return (
    <main className="error-boundary" role="alert">
      <section className="error-boundary__card">
        <h1 className="error-boundary__title">{t("errorBoundary.title")}</h1>
        <p className="error-boundary__message">{t("errorBoundary.message")}</p>
        <button
          className="button"
          type="button"
          disabled={writing || restarting}
          onClick={() => {
            setRestarting(true);
            setFailure(null);
            void restartApplication().catch((cause: unknown) => {
              setFailure({ cause });
              setRestarting(false);
            });
          }}
        >
          {t("errorBoundary.restart")}
        </button>
        {writing && <p role="status">{t("errorBoundary.waitingWrites")}</p>}
        {failure !== null && <ErrorMessage error={failure.cause} />}
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
