import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { getStartupRepository } from "../../lib/ipc";

import { BrandLogo } from "../BrandLogo/BrandLogo";
import { CommitDetailPanel } from "../CommitDetailPanel";
import { CommitSearch } from "../CommitSearch";
import { ErrorMessage } from "../ErrorMessage";
import { FileDiffView } from "../FileDiffView";
import { GitHubPicker } from "../GitHubPicker";
import { ProjectLibrary } from "../ProjectLibrary/ProjectLibrary";
import { PreferencesMenu } from "../PreferencesMenu";
import { Resizer } from "../Resizer";
import { Actions } from "../Toolbar";
import { INSPECTOR, SIDEBAR, useLayout } from "../../state/layout";
import { useLiveRepository } from "../../state/liveRepository";
import { Sidebar } from "../Sidebar";
import { TabBar, useTabShortcuts } from "../TabBar";
import { WorkingTreeDetailPanel } from "../WorkingTreeDetailPanel";
import { useCommitMetadata } from "../../state/commitMetadata";
import { useHistory } from "../../state/history";
import { useCurrentBranch } from "../../state/refs";
import {
  selectedCommitId as getSelectedCommitId,
  selectedFilePath as getSelectedFilePath,
} from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
  useWorkspace,
  tabOf,
} from "../../state/workspace";
import { useGitActions } from "../../state/gitActions";
import { useProjectCache } from "../../state/projectCache";
import { useNativeMenu } from "../../state/nativeMenu";
import { useOpenRepositoriesSync } from "../../state/openRepositories";
import { useVerifyActiveProject } from "../../state/verifyProject";
import { invalidateLive } from "../../state/queryKeys";

import { UnreachableProject } from "./UnreachableProject";
import { HistoryView } from "./HistoryView";
import { RepositoryPicker } from "./RepositoryPicker";
import { useOpenFolder } from "./useOpenFolder";

import "./AppShell.css";

/** The application window: toolbar, navigation and history. */
export function AppShell() {
  const { t } = useTranslation(["shell", "common"]);
  const repository = useActiveRepository();
  const verified = useWorkspace(
    (state) =>
      state.activeRoot !== null &&
      tabOf(state, state.activeRoot)?.verification.status === "verified",
  );
  const readableRoot = verified ? (repository?.path ?? null) : null;
  const selection = useNavigation((navigation) => navigation.selection);
  const selectedCommitId = useNavigation(getSelectedCommitId);
  const history = useHistory(readableRoot);
  const selectedFilePath = useNavigation(getSelectedFilePath);
  const libraryView = useWorkspace((state) => state.libraryView);
  const showGitHub = useWorkspace((state) => state.githubOpen);
  const setShowGitHub = useWorkspace((state) => state.setGitHubOpen);
  const layout = useLayout();
  const queryClient = useQueryClient();

  const watcher = useLiveRepository(readableRoot);
  const currentBranch = useCurrentBranch(readableRoot);
  const gitActions = useGitActions(repository?.path ?? null);
  const sidebarPinned = useNavigation((navigation) => navigation.sidebarPinned);
  const searchQuery = useNavigation((navigation) => navigation.searchQuery);

  const { revealCommit, setSidebarPinned, setSearchQuery } =
    useNavigationActions();
  const openProject = useWorkspace((state) => state.openProject);
  const notice = useWorkspace((state) => state.notice);
  const dismissNotice = useWorkspace((state) => state.dismissNotice);
  // Compared by value: a tab's own navigation changing is not a change of
  // which projects are open.
  const openPaths = useWorkspace(
    useShallow((state) => state.tabs.map((tab) => tab.repository.path)),
  );
  const openSync = useOpenRepositoriesSync(openPaths);
  const verification = useVerifyActiveProject();
  useProjectCache();
  const folder = useOpenFolder();
  useTabShortcuts(folder.choose);
  const nativeMenu = useNativeMenu(folder.choose);

  useEffect(() => {
    // The window says which repository it is showing, so two of them are
    // tellable apart in the dock and in the window switcher.
    document.title =
      repository === null ? "GitCanvas" : t("title", { name: repository.name });
  }, [repository, t]);

  useEffect(() => {
    // `gitcanvas /path/to/repo` opens straight into that repository. Failure is
    // deliberately quiet: the window still opens and the picker is right there,
    // which beats a startup error over an argument the user may have mistyped.
    let cancelled = false;
    let projectsChanged = false;
    const unsubscribe = useWorkspace.subscribe((state, previous) => {
      const now = state.tabs.map((tab) => tab.repository.path);
      const before = previous.tabs.map((tab) => tab.repository.path);
      if (
        state.activeRoot !== previous.activeRoot ||
        state.githubOpen !== previous.githubOpen ||
        state.libraryView !== previous.libraryView ||
        now.length !== before.length ||
        now.some((root, i) => root !== before[i])
      ) {
        projectsChanged = true;
      }
    });
    void getStartupRepository()
      .then((startup) => {
        if (!cancelled && !projectsChanged && startup !== null) {
          openProject(startup);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [openProject]);
  const selectedIndex =
    selectedCommitId === null
      ? undefined
      : history.commitIndexById.get(selectedCommitId);
  const loadedSelection =
    selectedIndex === undefined
      ? null
      : (history.commits[selectedIndex] ?? null);
  const metadata = useCommitMetadata(
    readableRoot,
    selectedCommitId,
    loadedSelection,
  );
  const selected = metadata.data ?? null;
  const readingCommitFile = selected !== null && selectedFilePath !== null;
  const worktreeFile = selection.kind === "worktree" ? selection : null;
  const readingWorktreeFile =
    worktreeFile !== null && worktreeFile.filePath !== null;
  const readingFile = readingCommitFile || readingWorktreeFile;
  const collapseSidebar = readingFile && !sidebarPinned;

  return (
    <div className="app-shell">
      <div className="app-shell__chrome">
        {repository !== null && <TabBar folder={folder} />}
        <header className="toolbar">
          <BrandLogo
            className={
              repository === null ? "toolbar__brand-wordmark" : "toolbar__brand"
            }
            variant={repository === null ? "horizontal" : "mark"}
            decorative
          />
          <span className="toolbar__repository" title={repository?.name}>
            {repository?.name ?? t("toolbar.noRepository")}
          </span>
          {repository !== null && (
            <button
              type="button"
              className="button"
              title={t("toolbar.refreshHint")}
              onClick={() => {
                void invalidateLive(queryClient, repository.path);
              }}
            >
              {t("toolbar.refresh")}
            </button>
          )}
          {watcher.status.kind === "degraded" && (
            <div role="alert" className="toolbar__status">
              <ErrorMessage error={watcher.status.error} />
              <button type="button" className="button" onClick={watcher.retry}>
                {t("common:actions.retry")}
              </button>
            </div>
          )}
          {notice !== null && (
            <div role="status" className="toolbar__status">
              <span>{t(`workspace.${notice.code}`, { max: notice.max })}</span>
              <button type="button" className="button" onClick={dismissNotice}>
                {t("workspace.dismiss")}
              </button>
            </div>
          )}
          {nativeMenu.error !== null && (
            <div role="alert" className="toolbar__status">
              <ErrorMessage
                error={nativeMenu.error}
                lead={t("toolbar.menuFailed")}
              />
              <button
                type="button"
                className="button"
                onClick={nativeMenu.retry}
              >
                {t("common:actions.retry")}
              </button>
            </div>
          )}
          {openSync.error !== null && (
            <div role="alert" className="toolbar__status">
              <ErrorMessage
                error={openSync.error}
                lead={t("toolbar.openSyncFailed")}
              />
              <button type="button" className="button" onClick={openSync.retry}>
                {t("common:actions.retry")}
              </button>
            </div>
          )}
          {readingFile && (
            <button
              type="button"
              className="button"
              aria-pressed={sidebarPinned}
              title={t("toolbar.branchesHint")}
              onClick={() => {
                setSidebarPinned(!sidebarPinned);
              }}
            >
              {t("toolbar.branches")}
            </button>
          )}
          {repository !== null && !readingFile && (
            <CommitSearch
              key={repository.path}
              commits={history.commits}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onGo={revealCommit}
            />
          )}
          <div className="toolbar__spacer" />
          <PreferencesMenu />
          {repository !== null && (
            <Actions actions={gitActions} currentBranch={currentBranch} />
          )}
        </header>
      </div>

      {showGitHub ? (
        <GitHubPicker
          onClose={() => {
            setShowGitHub(false);
          }}
        />
      ) : libraryView !== null ? (
        <ProjectLibrary only={libraryView} />
      ) : repository === null ? (
        <div className="app-shell__empty">
          <BrandLogo className="app-shell__empty-logo" variant="stacked" />
          <p className="app-shell__empty-hint">{t("empty.hint")}</p>
          <div className="app-shell__empty-actions">
            <RepositoryPicker folder={folder} />
            <button
              type="button"
              className="button"
              onClick={() => {
                setShowGitHub(true);
              }}
            >
              {t("empty.clone")}
            </button>
          </div>
          <ProjectLibrary />
        </div>
      ) : verification.error !== null ? (
        <UnreachableProject
          root={repository.path}
          error={verification.error}
          retry={verification.retry}
        />
      ) : !verified ? (
        <p className="state" role="status">
          {t("workspace.verifying")}
        </p>
      ) : (
        <div
          // Replaced, not updated, when another project is shown, so nothing a
          // view keeps for itself (scroll offset, focus, a half-typed field)
          // carries over from the project that was on screen before.
          key={repository.path}
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
            label={t("resizer.sidebar")}
            width={layout.sidebar}
            initialWidth={SIDEBAR.initial}
            min={SIDEBAR.min}
            max={layout.sidebarMax}
            grows="right"
            onResize={layout.setSidebar}
            hidden={collapseSidebar}
          />
          <main className="app-shell__history" aria-label={t("history.label")}>
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
            label={t("resizer.inspector")}
            width={layout.inspector}
            initialWidth={INSPECTOR.initial}
            min={INSPECTOR.min}
            max={layout.inspectorMax}
            grows="left"
            onResize={layout.setInspector}
          />
          {selected === null && selectedCommitId !== null ? (
            <aside
              className="detail-panel"
              aria-label={t("workspace.commitDetails")}
            >
              {metadata.isError ? (
                <div role="alert">
                  <ErrorMessage
                    error={metadata.error}
                    lead={t("workspace.commitFailed")}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      void metadata.refetch();
                    }}
                  >
                    {t("common:actions.retry")}
                  </button>
                </div>
              ) : (
                <p role="status" className="state">
                  {t("workspace.commitLoading")}
                </p>
              )}
            </aside>
          ) : selected === null ? (
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
