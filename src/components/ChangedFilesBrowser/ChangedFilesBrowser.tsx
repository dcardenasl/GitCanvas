import { Fragment, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ChangedFile } from "../../lib/changedFiles";
import { fileHistoryUnavailable } from "../../state/fileHistory";
import type { FileSource as NavigationFileSource } from "../../state/navigation";
import { useFileListPreferences } from "../../state/fileListPreferences";
import { useNavigation, useNavigationActions } from "../../state/workspace";
import { CommitTreeBrowser } from "./CommitTreeBrowser";
import {
  ChangedFileRow,
  type FileRowHistory,
} from "../ChangedFileRow/ChangedFileRow";
import { FolderIcon } from "../FolderIcon/FolderIcon";
import { buildFileTree, type FileTreeEntry } from "./tree";

import "./ChangedFilesBrowser.css";

/** Presentation sources include immutable saved comparisons. */
type FileSource = NavigationFileSource | "stash";

/** Files and presentation labels for one section of the changed-file list. */
export interface ChangedFilesGroup {
  readonly files: readonly ChangedFile[];
  readonly source: FileSource;
  readonly listLabel: string;
  readonly sectionLabel?: string;
  readonly heading?: ReactNode;
  /** Shown after the list, for example a control that loads more files. */
  readonly footer?: ReactNode;
}

/**
 * Where a file's history starts when its action is used: the commit the list
 * belongs to, or HEAD for local changes. `null` means the repository has no commits.
 */
export interface ChangedFilesHistory {
  readonly start: string | null;
  readonly open: (path: string) => void;
}

/** The history action of one row, or nothing when the list has no history source. */
function rowHistory(
  history: ChangedFilesHistory | undefined,
  path: string,
): FileRowHistory | undefined {
  if (history === undefined) return undefined;
  return {
    unavailable: fileHistoryUnavailable(path, history.start),
    onOpen: () => {
      history.open(path);
    },
  };
}

/** Inputs for rendering and navigating one or more changed-file groups. */
export interface ChangedFilesBrowserProps {
  readonly groups: readonly ChangedFilesGroup[];
  readonly selectedFilePath: string | null;
  readonly selectedFileSource: FileSource | null;
  readonly onOpen: (
    path: string,
    source: FileSource,
    snapshot?: boolean,
    fileKey?: string,
  ) => void;
  /** Optional session owner, so overlays do not alter durable graph folder preferences. */
  readonly folders?: {
    readonly collapsed: ReadonlySet<string>;
    readonly set: (paths: ReadonlySet<string>) => void;
    readonly toggle: (path: string) => void;
  };
  readonly allCommitFiles?: {
    readonly repositoryPath: string;
    readonly commitId: string;
  };
  readonly history?: ChangedFilesHistory | undefined;
}

/** Shared path/tree navigation for committed and local changed files. */
export function ChangedFilesBrowser({
  groups,
  selectedFilePath,
  selectedFileSource,
  onOpen,
  allCommitFiles,
  folders,
  history,
}: ChangedFilesBrowserProps) {
  const { t } = useTranslation("files");
  const view = useFileListPreferences((state) => state.view);
  const setView = useFileListPreferences((state) => state.setView);
  // Kept with the project, not with this list: a list that is replaced when
  // another project is shown must come back as it was left.
  const showAllCommitFiles = useNavigation(
    (navigation) => navigation.showAllCommitFiles,
  );
  const navigationCollapsedPaths = useNavigation(
    (navigation) => navigation.collapsedFolders,
  );
  const navigation = useNavigationActions();
  const { setShowAllCommitFiles } = navigation;
  const collapsedPaths = folders?.collapsed ?? navigationCollapsedPaths;
  const setCollapsedFolders = folders?.set ?? navigation.setCollapsedFolders;
  const toggleFolder = folders?.toggle ?? navigation.toggleFolder;

  const trees = useMemo(
    () => groups.map((group) => buildFileTree(group.files)),
    [groups],
  );
  const directoryPaths = useMemo(
    () => [...new Set(trees.flatMap((tree) => tree.directoryPaths))],
    [trees],
  );
  const hasFiles =
    groups.some((group) => group.files.length > 0) ||
    allCommitFiles !== undefined;
  const allExpanded = directoryPaths.every((path) => !collapsedPaths.has(path));

  const toggleAll = () => {
    setCollapsedFolders(allExpanded ? new Set(directoryPaths) : new Set());
  };

  return (
    <div className="changed-files-browser">
      {hasFiles && (
        <div className="changed-files-browser__toolbar">
          <div
            className="file-view-mode"
            role="group"
            aria-label={t("browser.viewLabel")}
          >
            <button
              type="button"
              className="file-view-mode__button"
              aria-pressed={view === "path"}
              onClick={() => {
                setShowAllCommitFiles(false);
                setView("path");
              }}
            >
              {t("browser.path")}
            </button>
            <button
              type="button"
              className="file-view-mode__button"
              aria-pressed={view === "tree"}
              onClick={() => {
                setView("tree");
              }}
            >
              {t("browser.tree")}
            </button>
          </div>

          {view === "tree" &&
            !(showAllCommitFiles && allCommitFiles !== undefined) &&
            directoryPaths.length > 0 && (
              <button
                type="button"
                className="file-tree__all-toggle"
                onClick={toggleAll}
              >
                {allExpanded
                  ? t("browser.collapseAll")
                  : t("browser.expandAll")}
              </button>
            )}
          {allCommitFiles !== undefined && (
            <label className="file-tree__all-files">
              <input
                type="checkbox"
                checked={showAllCommitFiles && view === "tree"}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setShowAllCommitFiles(checked);
                  if (checked) setView("tree");
                }}
              />
              <span>{t("browser.showAll")}</span>
            </label>
          )}
        </div>
      )}

      {allCommitFiles !== undefined && showAllCommitFiles && view === "tree" ? (
        <CommitTreeBrowser
          repositoryPath={allCommitFiles.repositoryPath}
          commitId={allCommitFiles.commitId}
          changedFiles={groups.flatMap((group) => [...group.files])}
          selectedFilePath={selectedFilePath}
          onOpen={(path, snapshot) => {
            onOpen(path, "commit", snapshot);
          }}
        />
      ) : (
        groups.map((group, index) => {
          const tree = trees[index];
          const contents =
            view === "path" || tree === undefined ? (
              <ul className="file-list" aria-label={group.listLabel}>
                {group.files.map((file) => (
                  <ChangedFileRow
                    key={file.key ?? file.path}
                    file={file}
                    path={file.path}
                    selected={
                      selectedFilePath === (file.key ?? file.path) &&
                      selectedFileSource === group.source
                    }
                    onOpen={() => {
                      onOpen(file.path, group.source, undefined, file.key);
                    }}
                    history={rowHistory(history, file.path)}
                  />
                ))}
              </ul>
            ) : (
              <ul className="file-tree" aria-label={group.listLabel}>
                <TreeEntries
                  entries={tree.entries}
                  collapsedPaths={collapsedPaths}
                  selectedFilePath={selectedFilePath}
                  selectedFileSource={selectedFileSource}
                  source={group.source}
                  onOpen={onOpen}
                  onToggleDirectory={toggleFolder}
                  history={history}
                />
              </ul>
            );

          if (group.sectionLabel === undefined) {
            return (
              <Fragment key={`${group.source}:${String(index)}`}>
                {contents}
                {group.footer}
              </Fragment>
            );
          }

          return (
            <section
              className="detail-panel__local-group"
              aria-label={group.sectionLabel}
              key={`${group.source}:${String(index)}`}
            >
              {group.heading}
              {contents}
              {group.footer}
            </section>
          );
        })
      )}
    </div>
  );
}

interface TreeEntriesProps {
  readonly entries: readonly FileTreeEntry[];
  readonly collapsedPaths: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly selectedFileSource: FileSource | null;
  readonly source: FileSource;
  readonly onOpen: ChangedFilesBrowserProps["onOpen"];
  readonly onToggleDirectory: (path: string) => void;
  readonly history?: ChangedFilesHistory | undefined;
}

function TreeEntries({
  entries,
  collapsedPaths,
  selectedFilePath,
  selectedFileSource,
  source,
  onOpen,
  onToggleDirectory,
  history,
}: TreeEntriesProps) {
  const { t } = useTranslation("files");

  return entries.map((entry) => {
    if (entry.kind === "file") {
      return (
        <ChangedFileRow
          key={entry.id}
          file={entry.file}
          path={entry.file.path}
          selected={
            selectedFilePath === (entry.file.key ?? entry.file.path) &&
            selectedFileSource === source
          }
          onOpen={() => {
            onOpen(entry.file.path, source, undefined, entry.file.key);
          }}
          showDirectory={false}
          history={rowHistory(history, entry.file.path)}
        />
      );
    }

    const isExpanded = !collapsedPaths.has(entry.path);

    return (
      <li className="file-tree__directory" key={`directory:${entry.path}`}>
        <button
          type="button"
          className="file-tree__toggle"
          aria-expanded={isExpanded}
          aria-label={t("tree.changedDirectory", {
            name: entry.name,
            count: entry.fileCount,
          })}
          onClick={() => {
            onToggleDirectory(entry.path);
          }}
        >
          <span className="file-tree__chevron" aria-hidden="true">
            ▸
          </span>
          <FolderIcon />
          <span className="file-tree__name">{entry.name}</span>
          <span className="file-tree__count" aria-hidden="true">
            {entry.fileCount}
          </span>
        </button>
        {isExpanded && (
          <ul className="file-tree file-tree__children">
            <TreeEntries
              entries={entry.entries}
              collapsedPaths={collapsedPaths}
              selectedFilePath={selectedFilePath}
              selectedFileSource={selectedFileSource}
              source={source}
              onOpen={onOpen}
              onToggleDirectory={onToggleDirectory}
              history={history}
            />
          </ul>
        )}
      </li>
    );
  });
}
