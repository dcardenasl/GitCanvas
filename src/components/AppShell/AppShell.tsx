import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getStartupRepository } from "../../lib/ipc";
import brandMark from "../../assets/branding/gitcanvas-mark.png";
import brandHorizontal from "../../assets/branding/gitcanvas-horizontal.png";

import { CommitDetailPanel } from "../CommitDetailPanel";
import { CommitSearch } from "../CommitSearch";
import { FileDiffView } from "../FileDiffView";
import { GitHubPicker } from "../GitHubPicker";
import { Resizer } from "../Resizer";
import { Actions, useGitActions } from "../Toolbar";
import { ThemeSelector } from "../ThemeSelector/ThemeSelector";
import { INSPECTOR, SIDEBAR, useLayout } from "../../state/layout";
import { useLiveRepository } from "../../state/liveRepository";
import { Sidebar } from "../Sidebar";
import { WorkingTreeDetailPanel } from "../WorkingTreeDetailPanel";
import { useHistory } from "../../state/history";
import { useCurrentBranch } from "../../state/refs";
import {
  selectedCommitId as getSelectedCommitId,
  selectedFilePath as getSelectedFilePath,
  useSession,
} from "../../state/session";
import { invalidateLive } from "../../state/queryKeys";

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
  const gitActions = useGitActions(repository?.path ?? null);
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
    if (useSession.getState().repository !== null) return;

    let cancelled = false;
    let repositoryChanged = false;
    const unsubscribe = useSession.subscribe((state, previous) => {
      if (state.repository !== previous.repository) repositoryChanged = true;
    });
    void getStartupRepository()
      .then((startup) => {
        if (
          !cancelled &&
          !repositoryChanged &&
          startup !== null &&
          useSession.getState().repository === null
        ) {
          setRepository(startup);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setRepository]);
  const selectedIndex =
    selectedCommitId === null
      ? undefined
      : history.commitIndexById.get(selectedCommitId);
  const selected =
    selectedIndex === undefined
      ? null
      : (history.commits[selectedIndex] ?? null);
  const readingCommitFile = selected !== null && selectedFilePath !== null;
  const worktreeFile = selection.kind === "worktree" ? selection : null;
  const readingWorktreeFile =
    worktreeFile !== null && worktreeFile.filePath !== null;
  const readingFile = readingCommitFile || readingWorktreeFile;
  const collapseSidebar = readingFile && !sidebarPinned;

  return (
    <div className="app-shell">
      <header className="toolbar">
        {repository !== null && (
          <img
            className="toolbar__brand"
            src={brandMark}
            alt=""
            aria-hidden="true"
          />
        )}
        <span className="toolbar__repository">
          {repository?.name ?? "Ningún repositorio abierto"}
        </span>
        {repository !== null && (
          <button
            type="button"
            className="button"
            title="Volver a leer el repositorio desde el disco"
            onClick={() => {
              void invalidateLive(queryClient, repository.path);
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
          <Actions actions={gitActions} currentBranch={currentBranch} />
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
          <img
            className="app-shell__empty-logo"
            src={brandHorizontal}
            alt="GitCanvas"
          />
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
          <Sidebar hidden={collapseSidebar} onCheckout={gitActions.checkout} />
          <Resizer
            label="Ancho de la barra lateral"
            width={layout.sidebar}
            initialWidth={SIDEBAR.initial}
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
              <HistoryView history={history} />
            )}
          </main>
          <Resizer
            label="Ancho del panel de detalle"
            width={layout.inspector}
            initialWidth={INSPECTOR.initial}
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
