import { userMessage } from "../../lib/errors";

/** Inputs for a localized retryable query error. */
export interface RetryErrorProps {
  readonly error: unknown;
  readonly isRetrying: boolean;
  readonly onRetry: () => void;
}

/** Localized query failure with an explicit, duplicate-safe retry action. */
export function RetryError({ error, isRetrying, onRetry }: RetryErrorProps) {
  return (
    <div className="state file-tree__state" role="alert">
      <p>{userMessage(error)}</p>
      <button
        type="button"
        className="file-tree__retry"
        disabled={isRetrying}
        onClick={onRetry}
      >
        Reintentar
      </button>
    </div>
  );
}
