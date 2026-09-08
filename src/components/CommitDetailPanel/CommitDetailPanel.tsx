import type { CommitInfo, FileChange, FileDiff } from "../../bindings";
import { useCommitDiff } from "../../state/diff";
import { useSession } from "../../state/session";
import {
  authorInitials,
  formatCommitTime,
  shortId,
} from "../CommitTable/format";

import "./CommitDetailPanel.css";

export interface CommitDetailPanelProps {
  readonly repositoryPath: string;
  readonly commit: CommitInfo;
}

/** One-letter marker per change kind, the way Git status reads. */
const CHANGE_MARK: Record<FileChange, string> = {
  Added: "A",
  Modified: "M",
  Deleted: "D",
  Renamed: "R",
  Copied: "C",
  TypeChanged: "T",
  Other: "?",
};

const CHANGE_LABEL: Record<FileChange, string> = {
  Added: "Añadido",
  Modified: "Modificado",
  Deleted: "Eliminado",
  Renamed: "Renombrado",
  Copied: "Copiado",
  TypeChanged: "Tipo cambiado",
  Other: "Otro",
};

/** Trailing file name, so a deep path still reads at a glance. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Everything before the file name, without the trailing slash. */
function directory(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
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
  const selectedFilePath = useSession((state) => state.selectedFilePath);
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
              <FileRow
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

interface FileRowProps {
  readonly file: FileDiff;
  readonly selected: boolean;
  readonly onOpen: () => void;
}

function FileRow({ file, selected, onOpen }: FileRowProps) {
  return (
    <li>
      <button
        type="button"
        className={selected ? "file-row file-row--selected" : "file-row"}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      >
        <span
          className={`file-row__mark file-row__mark--${file.change.toLowerCase()}`}
          title={CHANGE_LABEL[file.change]}
          aria-label={CHANGE_LABEL[file.change]}
        >
          {CHANGE_MARK[file.change]}
        </span>
        {/*
          Name first, directory after it.

          A path truncated from the left cuts the directory mid-token and runs
          it straight into the file name, which reads as one nonsense word.
          Leading with the name keeps the thing being looked for at a stable
          position and lets the directory truncate the ordinary way.
        */}
        <span className="file-row__path" title={file.path}>
          <span className="file-row__name">{fileName(file.path)}</span>
          {directory(file.path) !== "" && (
            <span className="file-row__dir">{directory(file.path)}</span>
          )}
        </span>
        <span className="file-row__stat">
          {file.omitted === null ? (
            <>
              <span className="detail-panel__stat-add">+{file.insertions}</span>{" "}
              <span className="detail-panel__stat-del">−{file.deletions}</span>
            </>
          ) : (
            <span className="file-row__omitted">
              {file.omitted === "Binary" ? "binario" : "grande"}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
