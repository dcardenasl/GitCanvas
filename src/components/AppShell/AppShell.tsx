import { useState } from "react";

import { CommitDetailPanel } from "../CommitDetailPanel";
import { GitHubPicker } from "../GitHubPicker";
import { Sidebar } from "../Sidebar";
import { useHistory } from "../../state/history";
import { useSession } from "../../state/session";

import { HistoryView } from "./HistoryView";
import { RepositoryPicker } from "./RepositoryPicker";

import "./AppShell.css";

/** The application window: toolbar, navigation and history. */
export function AppShell() {
  const repository = useSession((state) => state.repository);
  const selectedCommitId = useSession((state) => state.selectedCommitId);
  const history = useHistory(repository?.path ?? null);
  const [showGitHub, setShowGitHub] = useState(false);
  const selected =
    history.commits.find((commit) => commit.id === selectedCommitId) ?? null;

  return (
    <div className="app-shell">
      <header className="toolbar">
        <span className="toolbar__repository">
          {repository?.name ?? "Ningún repositorio abierto"}
        </span>
        <div className="toolbar__spacer" />
        <button
          type="button"
          className="button"
          aria-pressed={showGitHub}
          onClick={() => {
            setShowGitHub((open) => !open);
          }}
        >
          GitHub
        </button>
        <RepositoryPicker />
      </header>

      {showGitHub ? (
        <GitHubPicker
          onClose={() => {
            setShowGitHub(false);
          }}
        />
      ) : repository === null ? (
        <div className="app-shell__empty">
          <p className="app-shell__empty-title">GitCanvas</p>
          <p className="app-shell__empty-hint">
            Abrí un repositorio para ver su historial de ramas y commits.
          </p>
        </div>
      ) : (
        <div
          className={
            selected === null
              ? "app-shell__body"
              : "app-shell__body app-shell__body--inspecting"
          }
        >
          <Sidebar />
          <main className="app-shell__history" aria-label="Historial">
            <HistoryView />
          </main>
          {selected !== null && (
            <CommitDetailPanel
              repositoryPath={repository.path}
              commit={selected}
            />
          )}
        </div>
      )}
    </div>
  );
}
