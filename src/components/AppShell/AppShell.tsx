import { useEffect, useState } from "react";

import { getStartupRepository } from "../../lib/ipc";

import { CommitDetailPanel, EmptyInspector } from "../CommitDetailPanel";
import { CommitSearch } from "../CommitSearch";
import { FileDiffView } from "../FileDiffView";
import { GitHubPicker } from "../GitHubPicker";
import { Resizer } from "../Resizer";
import { Actions } from "../Toolbar";
import { INSPECTOR, SIDEBAR, useLayout } from "../../state/layout";
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
  const selectedFilePath = useSession((state) => state.selectedFilePath);
  const [showGitHub, setShowGitHub] = useState(false);
  const layout = useLayout();
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
  const readingFile = selected !== null && selectedFilePath !== null;
  const collapseSidebar = readingFile && !sidebarPinned;

  return (
    <div className="app-shell">
      <header className="toolbar">
        <span className="toolbar__repository">
          {repository?.name ?? "Ningún repositorio abierto"}
        </span>
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
        {repository !== null && (
          <Actions
            repositoryPath={repository.path}
            currentBranch={repository.name}
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
            Abrí un repositorio para ver su historial de ramas y commits.
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
            <EmptyInspector />
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
