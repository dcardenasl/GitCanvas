import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { PendingReleaseAction } from "../../state/releases";
import {
  getPendingReleaseAction,
  resumePendingReleaseAction,
} from "../../state/releases";
import { storeGithubToken } from "../../lib/ipc";
import { ErrorMessage } from "../ErrorMessage";

/** In-memory credential entry for an explicit, repository-bound recovery path. */
export function ReleaseAccessForm({
  repositoryPath,
  action,
  scope,
  message,
  onSaved,
}: {
  readonly repositoryPath: string;
  readonly action: PendingReleaseAction | null;
  readonly scope: "list" | "detail";
  readonly message?: string;
  readonly onSaved: (action: PendingReleaseAction | null) => void;
}) {
  const { t } = useTranslation("releases");
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  return (
    <section
      className="tags-releases-panel__access"
      aria-label={t("access.title")}
    >
      <p role="status">
        {message ??
          (action === null
            ? t("access.requiredNoPending")
            : t("access.required"))}
      </p>
      <label htmlFor={`release-access-token-${scope}`}>
        {t("access.tokenLabel")}
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim() === "" || saving) return;
          const pendingAction = action;
          setSaving(true);
          setError(null);
          void storeGithubToken(token.trim())
            .then(async () => {
              setToken("");
              const resumed =
                pendingAction !== null &&
                getPendingReleaseAction() === pendingAction;
              if (resumed)
                await resumePendingReleaseAction(repositoryPath, queryClient);
              onSaved(resumed ? pendingAction : null);
            })
            .catch((reason: unknown) => {
              setError(
                reason instanceof Error ? reason : new Error(String(reason)),
              );
            })
            .finally(() => {
              setSaving(false);
            });
        }}
      >
        <input
          id={`release-access-token-${scope}`}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => {
            setToken(event.currentTarget.value);
          }}
        />
        <button
          type="submit"
          className="button button--primary"
          disabled={token.trim() === "" || saving}
        >
          {saving ? t("access.saving") : t("access.save")}
        </button>
      </form>
      {error !== null && (
        <div role="alert">
          <ErrorMessage error={error} />
        </div>
      )}
    </section>
  );
}
