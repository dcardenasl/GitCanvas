import type { FileChange, FileDiff, FileDiffSummary } from "../../bindings";

import "../CommitDetailPanel/CommitDetailPanel.css";

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

type ChangedFile = FileDiff | FileDiffSummary;

interface ChangedFileRowProps {
  readonly file: ChangedFile;
  readonly selected: boolean;
  readonly onOpen: () => void;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function directory(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

/** Shared navigation row for committed and local file changes. */
export function ChangedFileRow({
  file,
  selected,
  onOpen,
}: ChangedFileRowProps) {
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
