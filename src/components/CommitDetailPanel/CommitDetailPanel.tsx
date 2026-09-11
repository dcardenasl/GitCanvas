import type { CommitInfo } from "../../bindings";
import { useCommitDiff } from "../../state/diff";
import { useSession } from "../../state/session";
import {
  authorInitials,
  formatCommitTime,
  shortId,
} from "../CommitTable/format";
import { ChangedFileRow } from "../ChangedFileRow/ChangedFileRow";

import "./CommitDetailPanel.css";

export interface CommitDetailPanelProps {
  readonly repositoryPath: string;
  readonly commit: CommitInfo;
}

/**
 * Metadata for the selected commit and the files it changed.
 *
 * The list is navigation, not content: choosing a file opens it in the centre
 * panel, where there is room to read it. Rendering every diff inline in a
 * 310px column, which is what this used to do, made long files unreadable and
 * short ones hard to find.
 */
export function CommitDetailPanel({
  repositoryPath,
  commit,
}: CommitDetailPanelProps) {
  const selection = useSession((state) => state.selection);
  const selectedFilePath =
    selection.kind === "commit" ? selection.filePath : null;
  const selectFile = useSession((state) => state.selectFile);

  const diff = useCommitDiff(repositoryPath, commit.id);

  return (
    <aside className="detail-panel" aria-label="Detalle del commit">
      <p className="detail-panel__hash">
        commit <span>{shortId(commit.id)}</span>
        {commit.parents[0] !== undefined && (
          <> · parent {shortId(commit.parents[0])}</>
        )}
      </p>

      <h2 className="detail-panel__summary">{commit.summary}</h2>

      <div className="detail-panel__author">
        <span className="detail-panel__avatar" aria-hidden="true">
          {authorInitials(commit.author_name)}
        </span>
        <div>
          <div className="detail-panel__who">{commit.author_name}</div>
          <div className="detail-panel__when">
            {formatCommitTime(commit.author_time)}
          </div>
        </div>
      </div>

      {commit.message.trim() !== commit.summary.trim() && (
        <pre className="detail-panel__body">{commit.message.trim()}</pre>
      )}

      {diff.isPending && (
        <p className="detail-panel__state">Leyendo los archivos…</p>
      )}

      {diff.error !== null && (
        <p className="detail-panel__state" role="alert">
          {diff.error.message}
        </p>
      )}

      {diff.data !== undefined && (
        <>
          {diff.data.is_merge && (
            <p className="detail-panel__note">
              Commit de merge: se muestran los cambios contra el primer padre.
            </p>
          )}

          <p className="detail-panel__files-label">
            {diff.data.files.length === 1
              ? "1 archivo modificado"
              : `${String(diff.data.files.length)} archivos modificados`}
            {" · "}
            <span className="detail-panel__stat-add">
              +{diff.data.insertions}
            </span>{" "}
            <span className="detail-panel__stat-del">
              −{diff.data.deletions}
            </span>
          </p>

          <ul className="file-list" aria-label="Archivos modificados">
            {diff.data.files.map((file) => (
              <ChangedFileRow
                key={file.path}
                file={file}
                selected={file.path === selectedFilePath}
                onOpen={() => {
                  selectFile(file.path);
                }}
              />
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
