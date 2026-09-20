import type { FileDiffSummary } from "../../bindings";
import { useSession, type FileSource } from "../../state/session";
import { useWorktreeSnapshot } from "../../state/worktree";
import {
  ChangedFilesBrowser,
  type ChangedFilesGroup,
} from "../ChangedFilesBrowser/ChangedFilesBrowser";

import "../CommitDetailPanel/CommitDetailPanel.css";

export interface WorkingTreeDetailPanelProps {
  readonly repositoryPath: string;
}

/** Inspector for the two local change sets Git exposes before a commit. */
export function WorkingTreeDetailPanel({
  repositoryPath,
}: WorkingTreeDetailPanelProps) {
  const selectFile = useSession((state) => state.selectFile);
  const selection = useSession((state) => state.selection);
  const local = useWorktreeSnapshot(repositoryPath);
  const localData = local.data;
  const stagedFiles = localData?.staged.files ?? [];
  const unstagedFiles = localData?.unstaged.files ?? [];
  const selectedFilePath =
    selection.kind === "worktree" ? selection.filePath : null;
  const selectedFileSource: FileSource | null =
    selection.kind === "worktree" ? selection.side : null;
  const groups: ChangedFilesGroup[] = [];

  if (stagedFiles.length > 0) {
    groups.push(localFileGroup("Preparados", stagedFiles, "staged"));
  }
  if (unstagedFiles.length > 0) {
    groups.push(localFileGroup("Sin preparar", unstagedFiles, "unstaged"));
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
          {local.error.message}
        </p>
      )}

      {!local.isPending &&
        local.error === null &&
        stagedFiles.length === 0 &&
        unstagedFiles.length === 0 && (
          <p className="detail-panel__state">No hay cambios locales.</p>
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
  files: readonly FileDiffSummary[],
  source: "staged" | "unstaged",
): ChangedFilesGroup {
  const insertions = files.reduce((sum, file) => sum + file.insertions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return {
    files,
    source,
    sectionLabel: label,
    listLabel: `Archivos ${label.toLowerCase()}`,
    heading: (
      <div className="detail-panel__local-group-head">
        <span>{label}</span>
        <span className="detail-panel__local-count">
          {files.length} ·{" "}
          <span className="detail-panel__stat-add">+{insertions}</span>{" "}
          <span className="detail-panel__stat-del">−{deletions}</span>
        </span>
      </div>
    ),
  };
}
