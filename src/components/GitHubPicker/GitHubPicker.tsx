import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";

import type { CloneProgressEvent } from "../../bindings";
import {
  cloneGithubRepository,
  forgetGithubToken,
  hasGithubToken,
  listGithubRepositories,
  onCloneProgress,
  openRepository,
  storeGithubToken,
} from "../../lib/ipc";
import { useSession } from "../../state/session";
import { queryKeys } from "../../state/queryKeys";
import { ErrorMessage } from "../ErrorMessage";

import "./GitHubPicker.css";

/** How many repositories GitHub's listing is cut at before it says so. */
const REPOSITORY_LIST_LIMIT = 1000;

/** Human-readable transfer progress for an in-flight clone. */
function progressLabel(
  t: TFunction<"github">,
  progress: CloneProgressEvent,
): string {
  const megabytes = Number(progress.received_bytes) / (1024 * 1024);
  if (progress.total_objects === 0) {
    // GitHub is still counting objects; a percentage would be a lie.
    return t("progress.preparing", { megabytes });
  }
  return t("progress.transfer", {
    ratio: progress.received_objects / progress.total_objects,
    megabytes,
  });
}

/** Signs in to GitHub, lists repositories and clones the chosen one. */
export function GitHubPicker({ onClose }: { readonly onClose: () => void }) {
  const { t } = useTranslation("github");
  const queryClient = useQueryClient();
  const setRepository = useSession((state) => state.openRepository);
  const activeRepositoryPath = useSession(
    (state) => state.repository?.path ?? null,
  );

  const [token, setToken] = useState("");
  const [progress, setProgress] = useState<CloneProgressEvent | null>(null);

  const signedIn = useQuery({
    queryKey: queryKeys.githubToken(),
    queryFn: hasGithubToken,
  });

  const repositories = useQuery({
    queryKey: queryKeys.githubRepositories(),
    enabled: signedIn.data === true,
    queryFn: listGithubRepositories,
  });

  useEffect(() => {
    // The listener outlives a render, so it is torn down on unmount rather
    // than left accumulating one subscription per re-render.
    const unlisten = onCloneProgress((event) => {
      setProgress(event.payload);
    });
    return () => {
      void unlisten.then((stop) => {
        stop();
      });
    };
  }, []);

  const signIn = useMutation({
    mutationFn: (value: string) => storeGithubToken(value.trim()),
    onSuccess: () => {
      setToken("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.github() });
    },
  });

  const signOut = useMutation({
    mutationFn: forgetGithubToken,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.github() }),
  });

  const clone = useMutation({
    mutationFn: ({ name }: { name: string }) =>
      cloneGithubRepository(name, activeRepositoryPath),
    onSuccess: async (cloned) => {
      setProgress(null);
      setRepository(await openRepository(cloned.path));
      onClose();
    },
  });

  if (signedIn.data !== true) {
    return (
      <div className="github-picker">
        <h2 className="github-picker__title">{t("connect.title")}</h2>
        <p className="github-picker__hint">
          <Trans t={t} i18nKey="connect.hint" components={{ code: <code /> }} />
        </p>
        {signedIn.error !== null && (
          <div className="github-picker__error" role="alert">
            <ErrorMessage error={signedIn.error} />
          </div>
        )}
        <form
          className="github-picker__form"
          onSubmit={(event) => {
            event.preventDefault();
            signIn.mutate(token);
          }}
        >
          <input
            className="github-picker__input"
            type="password"
            value={token}
            placeholder="ghp_…"
            aria-label={t("connect.tokenLabel")}
            onChange={(event) => {
              setToken(event.currentTarget.value);
            }}
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={token.trim() === "" || signIn.isPending}
          >
            {signIn.isPending ? t("connect.verifying") : t("connect.submit")}
          </button>
        </form>
        {signIn.error !== null && (
          <div className="github-picker__error" role="alert">
            <ErrorMessage error={signIn.error} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="github-picker">
      <header className="github-picker__header">
        <h2 className="github-picker__title">{t("list.title")}</h2>
        <button
          type="button"
          className="button"
          onClick={() => {
            signOut.mutate();
          }}
        >
          {t("list.disconnect")}
        </button>
      </header>

      {repositories.isPending && (
        <p className="github-picker__hint">{t("list.loading")}</p>
      )}

      {repositories.error !== null && (
        <div className="github-picker__error" role="alert">
          <ErrorMessage error={repositories.error} />
        </div>
      )}

      {clone.isPending && (
        <p className="github-picker__hint" role="status">
          {t("list.cloning")} {progress !== null && progressLabel(t, progress)}
        </p>
      )}

      {clone.error !== null && (
        <div className="github-picker__error" role="alert">
          <ErrorMessage error={clone.error} />
        </div>
      )}

      {repositories.data?.truncated === true && (
        <p className="github-picker__hint" role="status">
          {t("list.truncated", { limit: REPOSITORY_LIST_LIMIT })}
        </p>
      )}

      <ul className="github-picker__list">
        {(repositories.data?.repositories ?? []).map((repo) => (
          <li key={repo.full_name} className="github-picker__item">
            <div className="github-picker__item-main">
              <span className="github-picker__name">{repo.full_name}</span>
              {repo.private && (
                <span className="github-picker__badge">
                  {t("list.private")}
                </span>
              )}
              {repo.description !== null && (
                <span className="github-picker__description">
                  {repo.description}
                </span>
              )}
            </div>
            <button
              type="button"
              className="button"
              disabled={clone.isPending}
              onClick={() => {
                clone.mutate({ name: repo.full_name });
              }}
            >
              {t("list.clone")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
