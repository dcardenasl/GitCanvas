import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { CloneProgressEvent } from "../../bindings";
import { userMessage } from "../../lib/errors";
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

import "./GitHubPicker.css";

/** Human-readable transfer progress for an in-flight clone. */
function progressLabel(progress: CloneProgressEvent): string {
  const megabytes = Number(progress.received_bytes) / (1024 * 1024);
  if (progress.total_objects === 0) {
    // GitHub is still counting objects; a percentage would be a lie.
    return `Preparando… ${megabytes.toFixed(1)} MB`;
  }
  const percent = Math.round(
    (progress.received_objects / progress.total_objects) * 100,
  );
  return `${String(percent)}% · ${megabytes.toFixed(1)} MB`;
}

/** Signs in to GitHub, lists repositories and clones the chosen one. */
export function GitHubPicker({ onClose }: { readonly onClose: () => void }) {
  const queryClient = useQueryClient();
  const setRepository = useSession((state) => state.openRepository);

  const [token, setToken] = useState("");
  const [progress, setProgress] = useState<CloneProgressEvent | null>(null);

  const signedIn = useQuery({
    queryKey: ["github", "token"],
    queryFn: hasGithubToken,
  });

  const repositories = useQuery({
    queryKey: ["github", "repositories"],
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
    mutationFn: storeGithubToken,
    onSuccess: () => {
      setToken("");
      void queryClient.invalidateQueries({ queryKey: ["github"] });
    },
  });

  const signOut = useMutation({
    mutationFn: forgetGithubToken,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["github"] }),
  });

  const clone = useMutation({
    mutationFn: ({ url, name }: { url: string; name: string }) =>
      cloneGithubRepository(url, name),
    onSuccess: async (cloned) => {
      setProgress(null);
      setRepository(await openRepository(cloned.path));
      onClose();
    },
  });

  if (signedIn.data !== true) {
    return (
      <div className="github-picker">
        <h2 className="github-picker__title">Conectar con GitHub</h2>
        <p className="github-picker__hint">
          Pega un Personal Access Token con permiso <code>repo</code>. Se guarda
          en el llavero del sistema y nunca sale del backend.
        </p>
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
            aria-label="Personal Access Token"
            onChange={(event) => {
              setToken(event.currentTarget.value);
            }}
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={token.trim() === "" || signIn.isPending}
          >
            {signIn.isPending ? "Verificando…" : "Conectar"}
          </button>
        </form>
        {signIn.error !== null && (
          <p className="github-picker__error" role="alert">
            {userMessage(signIn.error)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="github-picker">
      <header className="github-picker__header">
        <h2 className="github-picker__title">Repositorios de GitHub</h2>
        <button
          type="button"
          className="button"
          onClick={() => {
            signOut.mutate();
          }}
        >
          Desconectar
        </button>
      </header>

      {repositories.isPending && (
        <p className="github-picker__hint">Cargando repositorios…</p>
      )}

      {repositories.error !== null && (
        <p className="github-picker__error" role="alert">
          {userMessage(repositories.error)}
        </p>
      )}

      {clone.isPending && (
        <p className="github-picker__hint" role="status">
          Clonando… {progress !== null && progressLabel(progress)}
        </p>
      )}

      {clone.error !== null && (
        <p className="github-picker__error" role="alert">
          {userMessage(clone.error)}
        </p>
      )}

      <ul className="github-picker__list">
        {(repositories.data ?? []).map((repo) => (
          <li key={repo.full_name} className="github-picker__item">
            <div className="github-picker__item-main">
              <span className="github-picker__name">{repo.full_name}</span>
              {repo.private && (
                <span className="github-picker__badge">privado</span>
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
                clone.mutate({ url: repo.clone_url, name: repo.full_name });
              }}
            >
              Clonar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
