import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getStartupRepository } from "../../lib/ipc";

import { CommitDetailPanel } from "../CommitDetailPanel";
import { CommitSearch } from "../CommitSearch";
import { FileDiffView } from "../FileDiffView";
import { GitHubPicker } from "../GitHubPicker";
import { Resizer } from "../Resizer";
import { Actions } from "../Toolbar";
import { ThemeSelector } from "../ThemeSelector/ThemeSelector";
import { INSPECTOR, SIDEBAR, useLayout } from "../../state/layout";
import { LIVE_QUERIES, useLiveRepository } from "../../state/liveRepository";
import { Sidebar } from "../Sidebar";
import { WorkingTreeDetailPanel } from "../WorkingTreeDetailPanel";
import { useHistory } from "../../state/history";
import { useCurrentBranch } from "../../state/refs";
import {
  selectedCommitId as getSelectedCommitId,
  selectedFilePath as getSelectedFilePath,
  useSession,
} from "../../state/session";

import { HistoryView } from "./HistoryView";
import { RepositoryPicker } from "./RepositoryPicker";

import "./AppShell.css";

/** The application window: toolbar, navigation and history. */
export function AppShell() {
  const repository = useSession((state) => state.repository);
  const selection = useSession((state) => state.selection);
  const selectedCommitId = useSession(getSelectedCommitId);
  const history = useHistory(repository?.path ?? null);
  const selectedFilePath = useSession(getSelectedFilePath);
  const [showGitHub, setShowGitHub] = useState(false);
  const layout = useLayout();
  const queryClient = useQueryClient();

  const watcher = useLiveRepository(repository?.path ?? null);
  const currentBranch = useCurrentBranch(repository?.path ?? null);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const revealCommit = useSession((state) => state.revealCommit);
  const setRepository = useSession((state) => state.openRepository);

  useEffect(() => {
    // The window says which repository it is showing, so two of them are
    // tellable apart in the dock and in the window switcher.
    document.title =
      repository === null ? "GitCanvas" : `${repository.name} — GitCanvas`;
  }, [repository]);

  useEffect(() => {
    // `gitcanvas /path/to/repo` opens straight into that repository. Failure is
    // deliberately quiet: the window still opens and the picker is right there,
    // which beats a startup error over an argument the user may have mistyped.
    void getStartupRepository()
      .then((startup) => {
        if (startup !== null) setRepository(startup);
      })
      .catch(() => undefined);
  }, [setRepository]);
  const selected =
    history.commits.find((commit) => commit.id === selectedCommitId) ?? null;
  const readingCommitFile = selected !== null && selectedFilePath !== null;
  const worktreeFile = selection.kind === "worktree" ? selection : null;
  const readingWorktreeFile =
    worktreeFile !== null && worktreeFile.filePath !== null;
  const readingFile = readingCommitFile || readingWorktreeFile;
  const collapseSidebar = readingFile && !sidebarPinned;

  return (
    <div className="app-shell">
      <header className="toolbar">
        <span className="toolbar__repository">
          {repository?.name ?? "Ningún repositorio abierto"}
        </span>
        {repository !== null && (
          <button
            type="button"
            className="button"
            title="Volver a leer el repositorio desde el disco"
            onClick={() => {
              for (const key of LIVE_QUERIES) {
                void queryClient.invalidateQueries({
                  queryKey: [key, repository.path],
                });
              }
            }}
          >
            Actualizar
          </button>
        )}
        {watcher.status.kind === "degraded" && (
          <span role="alert" className="toolbar__status">
            Watcher degradado: {watcher.status.message}
            <button type="button" className="button" onClick={watcher.retry}>
              Reintentar
            </button>
          </span>
        )}
        {readingFile && (
          <button
            type="button"
            className="button"
            aria-pressed={sidebarPinned}
            title="Mostrar las ramas mientras se lee un archivo"
            onClick={() => {
              setSidebarPinned((pinned) => !pinned);
            }}
          >
            Ramas
          </button>
        )}
        {repository !== null && !readingFile && (
          <CommitSearch commits={history.commits} onGo={revealCommit} />
        )}
        <div className="toolbar__spacer" />
        <ThemeSelector />
        {repository !== null && (
          <Actions
            repositoryPath={repository.path}
            currentBranch={currentBranch}
          />
        )}
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
            Abre un repositorio para ver su historial de ramas y commits.
          </p>
        </div>
      ) : (
        <div
          className="app-shell__body"
          style={
            {
              /*
               * Reading a file gets the sidebar's width back: branches are
               * navigation between commits, and a file is not one of them.
               * Pinning overrides that for anyone who wants it anyway.
               *
               * Collapsing is width only. The children are always the same
               * five, because the grid declares five columns and dropping a
               * child shifts every later one into the wrong column — which
               * once put the file view in the sidebar's zero-width slot and
               * left the inspector filling the window.
               */
              "--sidebar-width": collapseSidebar
                ? "0px"
                : `${String(layout.sidebar)}px`,
              "--sidebar-divider": collapseSidebar ? "0px" : "auto",
              "--inspector-width": `${String(layout.inspector)}px`,
            } as React.CSSProperties
          }
        >
          <Sidebar hidden={collapseSidebar} />
          <Resizer
            label="Ancho de la barra lateral"
            width={layout.sidebar}
            min={SIDEBAR.min}
            max={layout.sidebarMax}
            grows="right"
            onResize={layout.setSidebar}
            hidden={collapseSidebar}
          />
          <main className="app-shell__history" aria-label="Historial">
            {selected !== null && selectedFilePath !== null ? (
              <FileDiffView
                repositoryPath={repository.path}
                commit={selected}
                path={selectedFilePath}
                snapshot={
                  selection.kind === "commit" &&
                  selection.fileMode === "snapshot"
                }
              />
            ) : worktreeFile !== null && worktreeFile.filePath !== null ? (
              <FileDiffView
                repositoryPath={repository.path}
                path={worktreeFile.filePath}
                worktree={{ side: worktreeFile.side }}
              />
            ) : (
              <HistoryView />
            )}
          </main>
          <Resizer
            label="Ancho del panel de detalle"
            width={layout.inspector}
            min={INSPECTOR.min}
            max={layout.inspectorMax}
            grows="left"
            onResize={layout.setInspector}
          />
          {selected === null ? (
            <WorkingTreeDetailPanel repositoryPath={repository.path} />
          ) : (
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
