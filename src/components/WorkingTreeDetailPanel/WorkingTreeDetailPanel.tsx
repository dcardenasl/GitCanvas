import { userMessage } from "../../lib/errors";
import { useSession, type FileSource } from "../../state/session";
import { useWorktreeFiles, type LocalSide } from "../../state/worktree";
import {
  ChangedFilesBrowser,
  type ChangedFilesGroup,
} from "../ChangedFilesBrowser/ChangedFilesBrowser";

import "../CommitDetailPanel/CommitDetailPanel.css";

/** Canonical repository path whose staged and unstaged changes are shown. */
export interface WorkingTreeDetailPanelProps {
  readonly repositoryPath: string;
}

/** Inspector for the two local change sets Git exposes before a commit. */
export function WorkingTreeDetailPanel({
  repositoryPath,
}: WorkingTreeDetailPanelProps) {
  const selectFile = useSession((state) => state.selectFile);
  const selection = useSession((state) => state.selection);
  const {
    snapshot: local,
    staged,
    unstaged,
    loadMore,
    loadingSide,
    loadError,
  } = useWorktreeFiles(repositoryPath);
  const stagedFiles = staged?.files ?? [];
  const unstagedFiles = unstaged?.files ?? [];
  const localData = local.data;
  const selectedFilePath =
    selection.kind === "worktree" ? selection.filePath : null;
  const selectedFileSource: FileSource | null =
    selection.kind === "worktree" ? selection.side : null;
  const groups: ChangedFilesGroup[] = [];

  if (staged !== null && staged.files.length > 0) {
    groups.push(
      localFileGroup("Preparados", staged, "staged", {
        loading: loadingSide === "staged",
        onLoadMore: () => {
          void loadMore("staged");
        },
      }),
    );
  }
  if (unstaged !== null && unstaged.files.length > 0) {
    groups.push(
      localFileGroup("Sin preparar", unstaged, "unstaged", {
        loading: loadingSide === "unstaged",
        onLoadMore: () => {
          void loadMore("unstaged");
        },
      }),
    );
  }

  return (
    <aside className="detail-panel" aria-label="Cambios locales">
      <p className="detail-panel__hash">working tree</p>
      <h2 className="detail-panel__summary">Cambios locales</h2>
      <p className="detail-panel__local-hint">
        Lo que cambió en disco desde el último commit.
      </p>

      {local.isPending && !localData && (
        <p className="detail-panel__state">Leyendo cambios locales…</p>
      )}
      {local.error !== null && groups.length === 0 && (
        <p className="detail-panel__state" role="alert">
          {userMessage(local.error)}
        </p>
      )}

      {!local.isPending &&
        local.error === null &&
        stagedFiles.length === 0 &&
        unstagedFiles.length === 0 && (
          <p className="detail-panel__state">No hay cambios locales.</p>
        )}

      {loadError !== null && (
        <p className="detail-panel__state" role="alert">
          {userMessage(loadError)}
        </p>
      )}

      {groups.length > 0 && (
        <ChangedFilesBrowser
          groups={groups}
          selectedFilePath={selectedFilePath}
          selectedFileSource={selectedFileSource}
          onOpen={(path, source) => {
            selectFile(path, source);
          }}
        />
      )}
    </aside>
  );
}

function localFileGroup(
  label: string,
  side: LocalSide,
  source: "staged" | "unstaged",
  more: { readonly loading: boolean; readonly onLoadMore: () => void },
): ChangedFilesGroup {
  return {
    files: side.files,
    source,
    sectionLabel: label,
    listLabel: `Archivos ${label.toLowerCase()}`,
    heading: (
      <div className="detail-panel__local-group-head">
        <span>{label}</span>
        <span className="detail-panel__local-count">
          {side.totalFiles} ·{" "}
          <span className="detail-panel__stat-add">+{side.insertions}</span>{" "}
          <span className="detail-panel__stat-del">−{side.deletions}</span>
        </span>
      </div>
    ),
    footer:
      side.remaining > 0 ? (
        <button
          type="button"
          className="file-tree__more"
          disabled={more.loading}
          onClick={more.onLoadMore}
        >
          {more.loading
            ? "Cargando…"
            : `Cargar ${String(side.remaining)} archivos más`}
        </button>
      ) : null,
  };
}
