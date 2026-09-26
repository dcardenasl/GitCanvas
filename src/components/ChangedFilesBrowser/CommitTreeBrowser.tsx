import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type {
  CommitTreeEntry,
  FileDiff,
  FileDiffSummary,
} from "../../bindings";
import { userMessage } from "../../lib/errors";
import { getCommitTreePage } from "../../lib/ipc";
import { ChangedFileRow } from "../ChangedFileRow/ChangedFileRow";

type ChangedFile = FileDiff | FileDiffSummary;

const TREE_NAME_ORDER = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function orderEntries(entries: readonly CommitTreeEntry[]): CommitTreeEntry[] {
  return [...entries].sort((left, right) => {
    const leftDirectory = left.kind === "Directory";
    const rightDirectory = right.kind === "Directory";
    if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
    return (
      TREE_NAME_ORDER.compare(left.name, right.name) ||
      (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    );
  });
}

interface CommitTreeBrowserProps {
  readonly repositoryPath: string;
  readonly commitId: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly selectedFilePath: string | null;
  readonly onOpen: (path: string, snapshot: boolean) => void;
}

/** Lazy, paged browser for the complete immutable tree at one commit. */
export function CommitTreeBrowser({
  repositoryPath,
  commitId,
  changedFiles,
  selectedFilePath,
  onOpen,
}: CommitTreeBrowserProps) {
  const changedByPath = useMemo(
    () => new Map(changedFiles.map((file) => [file.path, file])),
    [changedFiles],
  );
  const changedCountByDirectory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of changedFiles) {
      const segments = file.path.split("/");
      segments.pop();
      let path = "";
      for (const segment of segments) {
        path = path === "" ? segment : `${path}/${segment}`;
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return counts;
  }, [changedFiles]);
  const tree = useInfiniteQuery({
    queryKey: ["commit-tree", repositoryPath, commitId, null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getCommitTreePage(repositoryPath, {
        commit_id: commitId,
        directory_path: null,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    staleTime: Infinity,
  });
  const entries = useMemo(
    () => orderEntries(tree.data?.pages.flatMap((page) => page.entries) ?? []),
    [tree.data],
  );
  const deletedFiles = changedFiles.filter((file) => file.change === "Deleted");

  return (
    <div className="commit-tree-browser">
      {tree.isPending && (
        <p className="file-tree__state">Leyendo archivos del commit…</p>
      )}
      {tree.error !== null && (
        <div className="file-tree__state" role="alert">
          <p>{userMessage(tree.error)}</p>
          <button
            type="button"
            className="file-tree__retry"
            disabled={tree.isFetching}
            onClick={() => void tree.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}
      {tree.data !== undefined && entries.length === 0 && (
        <p className="file-tree__state">Este commit no contiene archivos.</p>
      )}
      {entries.length > 0 && (
        <ul className="file-tree" aria-label="Todos los archivos del commit">
          <TreeEntries
            entries={entries}
            repositoryPath={repositoryPath}
            commitId={commitId}
            changedByPath={changedByPath}
            changedCountByDirectory={changedCountByDirectory}
            selectedFilePath={selectedFilePath}
            onOpen={onOpen}
          />
        </ul>
      )}
      {tree.hasNextPage && (
        <button
          type="button"
          className="file-tree__more"
          disabled={tree.isFetchingNextPage}
          onClick={() => void tree.fetchNextPage()}
        >
          {tree.isFetchingNextPage ? "Cargando…" : "Cargar más entradas"}
        </button>
      )}

      {deletedFiles.length > 0 && (
        <section
          className="commit-tree-browser__deleted"
          aria-label="Archivos eliminados en este commit"
        >
          <p className="detail-panel__local-group-head">
            Eliminados en este commit
          </p>
          <ul className="file-list" aria-label="Archivos eliminados">
            {deletedFiles.map((file) => (
              <ChangedFileRow
                key={file.path}
                file={file}
                path={file.path}
                selected={selectedFilePath === file.path}
                onOpen={() => {
                  onOpen(file.path, false);
                }}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface TreeEntriesProps {
  readonly entries: readonly CommitTreeEntry[];
  readonly repositoryPath: string;
  readonly commitId: string;
  readonly changedByPath: ReadonlyMap<string, ChangedFile>;
  readonly changedCountByDirectory: ReadonlyMap<string, number>;
  readonly selectedFilePath: string | null;
  readonly onOpen: (path: string, snapshot: boolean) => void;
}

function TreeEntries({
  entries,
  repositoryPath,
  commitId,
  changedByPath,
  changedCountByDirectory,
  selectedFilePath,
  onOpen,
}: TreeEntriesProps) {
  return entries.map((entry) => {
    if (entry.kind === "Directory") {
      return (
        <TreeDirectory
          key={`directory:${entry.path}`}
          entry={entry}
          repositoryPath={repositoryPath}
          commitId={commitId}
          changedByPath={changedByPath}
          changedCountByDirectory={changedCountByDirectory}
          selectedFilePath={selectedFilePath}
          onOpen={onOpen}
        />
      );
    }

    if (entry.kind === "Submodule") {
      return (
        <li className="file-tree__submodule" key={`submodule:${entry.path}`}>
          <span aria-label={`${entry.name}, submódulo`} title="Submódulo">
            {entry.name}
          </span>
          <span className="file-row__omitted">submódulo</span>
        </li>
      );
    }

    const changed = changedByPath.get(entry.path) ?? null;
    return (
      <ChangedFileRow
        key={`file:${entry.path}`}
        file={changed}
        path={entry.path}
        selected={selectedFilePath === entry.path}
        showDirectory={false}
        onOpen={() => {
          onOpen(entry.path, changed === null);
        }}
      />
    );
  });
}

interface TreeDirectoryProps extends Omit<TreeEntriesProps, "entries"> {
  readonly entry: CommitTreeEntry;
}

function TreeDirectory({
  entry,
  repositoryPath,
  commitId,
  changedByPath,
  changedCountByDirectory,
  selectedFilePath,
  onOpen,
}: TreeDirectoryProps) {
  const [expanded, setExpanded] = useState(false);
  const children = useInfiniteQuery({
    queryKey: ["commit-tree", repositoryPath, commitId, entry.path],
    enabled: expanded,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getCommitTreePage(repositoryPath, {
        commit_id: commitId,
        directory_path: entry.path,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    staleTime: Infinity,
  });
  const entries = useMemo(
    () =>
      orderEntries(children.data?.pages.flatMap((page) => page.entries) ?? []),
    [children.data],
  );
  const changedCount = changedCountByDirectory.get(entry.path) ?? 0;

  return (
    <li className="file-tree__directory" key={`directory:${entry.path}`}>
      <button
        type="button"
        className="file-tree__toggle"
        aria-expanded={expanded}
        aria-label={`${entry.name}, carpeta${changedCount > 0 ? `, ${String(changedCount)} archivo${changedCount === 1 ? "" : "s"} con cambios` : ""}`}
        onClick={() => {
          setExpanded((value) => !value);
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
        {changedCount > 0 && (
          <span className="file-tree__count" aria-hidden="true">
            {changedCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="file-tree__contents">
          {children.isPending && (
            <p className="file-tree__state">Leyendo carpeta…</p>
          )}
          {children.error !== null && (
            <div className="file-tree__state" role="alert">
              <p>{userMessage(children.error)}</p>
              <button
                type="button"
                className="file-tree__retry"
                disabled={children.isFetching}
                onClick={() => void children.refetch()}
              >
                Reintentar
              </button>
            </div>
          )}
          {children.data !== undefined && entries.length === 0 && (
            <p className="file-tree__state">No hay archivos en esta carpeta.</p>
          )}
          {entries.length > 0 && (
            <ul className="file-tree file-tree__children">
              <TreeEntries
                entries={entries}
                repositoryPath={repositoryPath}
                commitId={commitId}
                changedByPath={changedByPath}
                changedCountByDirectory={changedCountByDirectory}
                selectedFilePath={selectedFilePath}
                onOpen={onOpen}
              />
            </ul>
          )}
          {children.hasNextPage && (
            <button
              type="button"
              className="file-tree__more"
              disabled={children.isFetchingNextPage}
              onClick={() => void children.fetchNextPage()}
            >
              {children.isFetchingNextPage
                ? "Cargando…"
                : "Cargar más entradas"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
