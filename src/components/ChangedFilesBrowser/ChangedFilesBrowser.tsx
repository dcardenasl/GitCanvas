import { Fragment, useMemo, useState, type ReactNode } from "react";

import { CommitTreeBrowser } from "./CommitTreeBrowser";
import type { FileSource } from "../../state/session";
import { useFileListPreferences } from "../../state/fileListPreferences";
import { ChangedFileRow } from "../ChangedFileRow/ChangedFileRow";
import { buildFileTree, type ChangedFile, type FileTreeEntry } from "./tree";

export interface ChangedFilesGroup {
  readonly files: readonly ChangedFile[];
  readonly source: FileSource;
  readonly listLabel: string;
  readonly sectionLabel?: string;
  readonly heading?: ReactNode;
  /** Shown after the list, for example a control that loads more files. */
  readonly footer?: ReactNode;
}

export interface ChangedFilesBrowserProps {
  readonly groups: readonly ChangedFilesGroup[];
  readonly selectedFilePath: string | null;
  readonly selectedFileSource: FileSource | null;
  readonly onOpen: (
    path: string,
    source: FileSource,
    snapshot?: boolean,
  ) => void;
  readonly allCommitFiles?: {
    readonly repositoryPath: string;
    readonly commitId: string;
  };
}

/** Shared path/tree navigation for committed and local changed files. */
export function ChangedFilesBrowser({
  groups,
  selectedFilePath,
  selectedFileSource,
  onOpen,
  allCommitFiles,
}: ChangedFilesBrowserProps) {
  const view = useFileListPreferences((state) => state.view);
  const setView = useFileListPreferences((state) => state.setView);
  const [showAllCommitFiles, setShowAllCommitFiles] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

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

  const toggleDirectory = (path: string) => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    setCollapsedPaths(allExpanded ? new Set(directoryPaths) : new Set());
  };

  return (
    <div className="changed-files-browser">
      {hasFiles && (
        <div className="changed-files-browser__toolbar">
          <div
            className="file-view-mode"
            role="group"
            aria-label="Vista de archivos"
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
              Ruta
            </button>
            <button
              type="button"
              className="file-view-mode__button"
              aria-pressed={view === "tree"}
              onClick={() => {
                setView("tree");
              }}
            >
              Árbol
            </button>
          </div>

          {view === "tree" &&
            !showAllCommitFiles &&
            directoryPaths.length > 0 && (
              <button
                type="button"
                className="file-tree__all-toggle"
                onClick={toggleAll}
              >
                {allExpanded ? "Contraer todo" : "Expandir todo"}
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
              <span>Ver todos los archivos</span>
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
                    key={file.path}
                    file={file}
                    path={file.path}
                    selected={
                      selectedFilePath === file.path &&
                      selectedFileSource === group.source
                    }
                    onOpen={() => {
                      onOpen(file.path, group.source);
                    }}
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
                  onToggleDirectory={toggleDirectory}
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
  readonly onOpen: (path: string, source: FileSource) => void;
  readonly onToggleDirectory: (path: string) => void;
}

function TreeEntries({
  entries,
  collapsedPaths,
  selectedFilePath,
  selectedFileSource,
  source,
  onOpen,
  onToggleDirectory,
}: TreeEntriesProps) {
  return entries.map((entry) => {
    if (entry.kind === "file") {
      return (
        <ChangedFileRow
          key={entry.id}
          file={entry.file}
          path={entry.file.path}
          selected={
            selectedFilePath === entry.file.path &&
            selectedFileSource === source
          }
          onOpen={() => {
            onOpen(entry.file.path, source);
          }}
          showDirectory={false}
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
          aria-label={`${entry.name}, ${String(entry.fileCount)} ${entry.fileCount === 1 ? "archivo modificado" : "archivos modificados"}`}
          onClick={() => {
            onToggleDirectory(entry.path);
          }}
        >
          <span className="file-tree__chevron" aria-hidden="true">
            ▸
          </span>
          <span className="file-tree__folder" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M1.5 4.5h4l1.5 1.5h7.5v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
                stroke="currentColor"
                strokeLinejoin="round"
              />
              <path d="M1.5 6h13" stroke="currentColor" />
            </svg>
          </span>
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
            />
          </ul>
        )}
      </li>
    );
  });
}
