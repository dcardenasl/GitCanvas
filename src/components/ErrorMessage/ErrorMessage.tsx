import { useState } from "react";
import { useTranslation } from "react-i18next";

import { copyText } from "../../lib/clipboard";
import { describeError } from "../../lib/errors";

import "./ErrorMessage.css";

/** The failure to introduce, and an optional sentence that says what failed. */
export interface ErrorMessageProps {
  readonly error: unknown;
  /** What was being attempted, shown before the error's own summary. */
  readonly lead?: string;
}

/**
 * A failure in the interface language, with the original diagnostic behind a
 * disclosure.
 *
 * The summary names the kind of failure; the backend's English message is the
 * precise cause and stays available, and copyable, for a bug report. It is
 * never pasted into the translated sentence.
 */
export function ErrorMessage({ error, lead }: ErrorMessageProps) {
  const { t } = useTranslation("errors");
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);
  const { summary, detail } = describeError(error);

  return (
    <div className="error-message">
      <span className="error-message__summary">
        {lead === undefined ? summary : t("withLead", { lead, summary })}
      </span>
      {detail !== null && (
        <details className="error-message__details">
          <summary className="error-message__toggle">
            {t("details.show")}
          </summary>
          <code className="error-message__detail" lang="en" dir="ltr">
            {detail}
          </code>
          <button
            type="button"
            className="button error-message__copy"
            onClick={() => {
              void copyText(detail).then((ok) => {
                setFeedback(ok ? "copied" : "failed");
              });
            }}
          >
            {t("details.copy")}
          </button>
          <span className="error-message__feedback" role="status">
            {feedback === null
              ? ""
              : t(
                  feedback === "copied"
                    ? "details.copied"
                    : "details.copyFailed",
                )}
          </span>
        </details>
      )}
    </div>
  );
}
