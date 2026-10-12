import { useTranslation } from "react-i18next";

import { ErrorMessage } from "../ErrorMessage";

/** Inputs for a localized retryable query error. */
export interface RetryErrorProps {
  readonly error: unknown;
  readonly isRetrying: boolean;
  readonly onRetry: () => void;
}

/** Localized query failure with an explicit, duplicate-safe retry action. */
export function RetryError({ error, isRetrying, onRetry }: RetryErrorProps) {
  const { t } = useTranslation();

  return (
    <div className="state file-tree__state" role="alert">
      <ErrorMessage error={error} />
      <button
        type="button"
        className="file-tree__retry"
        disabled={isRetrying}
        onClick={onRetry}
      >
        {t("actions.retry")}
      </button>
    </div>
  );
}
