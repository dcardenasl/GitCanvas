import type { FileDiffSummary } from "../../bindings";
import { useSession, type FileSource } from "../../state/session";
import { useWorktreeSnapshot } from "../../state/worktree";
import { ChangedFileRow } from "../ChangedFileRow/ChangedFileRow";

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

  return (
    <aside className="detail-panel" aria-label="Cambios locales">
      <p className="detail-panel__hash">working tree</p>
      <h2 className="detail-panel__summary">Cambios locales</h2>
      <p className="detail-panel__local-hint">
        Lo que cambió en disco desde el último commit.
      </p>

      {local.isPending && (
        <p className="detail-panel__state">Leyendo cambios locales…</p>
      )}
      {local.error !== null && (
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

      {stagedFiles.length > 0 && (
        <LocalFileGroup
          label="Preparados"
          files={stagedFiles}
          source="staged"
          selectedFilePath={selectedFilePath}
          selectedFileSource={selectedFileSource}
          onOpen={(path, source) => {
            selectFile(path, source);
          }}
        />
      )}

      {unstagedFiles.length > 0 && (
        <LocalFileGroup
          label="Sin preparar"
          files={unstagedFiles}
          source="unstaged"
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

interface LocalFileGroupProps {
  readonly label: string;
  readonly files: readonly FileDiffSummary[];
  readonly source: "staged" | "unstaged";
  readonly selectedFilePath: string | null;
  readonly selectedFileSource: FileSource | null;
  readonly onOpen: (path: string, source: "staged" | "unstaged") => void;
}

function LocalFileGroup({
  label,
  files,
  source,
  selectedFilePath,
  selectedFileSource,
  onOpen,
}: LocalFileGroupProps) {
  const insertions = files.reduce((sum, file) => sum + file.insertions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <section className="detail-panel__local-group" aria-label={label}>
      <div className="detail-panel__local-group-head">
        <span>{label}</span>
        <span className="detail-panel__local-count">
          {files.length} ·{" "}
          <span className="detail-panel__stat-add">+{insertions}</span>{" "}
          <span className="detail-panel__stat-del">−{deletions}</span>
        </span>
      </div>
      <ul className="file-list" aria-label={`Archivos ${label.toLowerCase()}`}>
        {files.map((file) => (
          <ChangedFileRow
            key={file.path}
            file={file}
            selected={
              selectedFilePath === file.path && selectedFileSource === source
            }
            onOpen={() => {
              onOpen(file.path, source);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
