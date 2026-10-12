import { useTranslation } from "react-i18next";

import type { FileChange } from "../../bindings";
import type { ChangedFile } from "../../lib/changedFiles";
import { DiffStat } from "../DiffStat/DiffStat";

const CHANGE_MARK: Record<FileChange, string> = {
  Added: "A",
  Modified: "M",
  Deleted: "D",
  Renamed: "R",
  Copied: "C",
  TypeChanged: "T",
  Other: "?",
};

interface ChangedFileRowProps {
  readonly file: ChangedFile | null;
  readonly path: string;
  readonly selected: boolean;
  readonly onOpen: () => void;
  readonly showDirectory?: boolean;
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
  path,
  selected,
  onOpen,
  showDirectory = true,
}: ChangedFileRowProps) {
  const { t } = useTranslation("files");

  return (
    <li>
      <button
        type="button"
        className={selected ? "file-row file-row--selected" : "file-row"}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      >
        {file === null ? (
          <span
            className="file-row__mark file-row__mark--unchanged"
            title={t("change.unchanged")}
            aria-label={t("change.unchanged")}
          >
            ·
          </span>
        ) : (
          <span
            className={`file-row__mark file-row__mark--${file.change.toLowerCase()}`}
            title={t(`change.${file.change}`)}
            aria-label={t(`change.${file.change}`)}
          >
            {CHANGE_MARK[file.change]}
          </span>
        )}
        <span className="file-row__path" title={path}>
          <span className="file-row__name">{fileName(path)}</span>
          {showDirectory && directory(path) !== "" && (
            <span className="file-row__dir">{directory(path)}</span>
          )}
        </span>
        <span className="file-row__stat">
          {file === null ? null : file.omitted === null ? (
            <DiffStat insertions={file.insertions} deletions={file.deletions} />
          ) : (
            <span className="file-row__omitted">
              {file.omitted === "Binary"
                ? t("omitted.binary")
                : t("omitted.large")}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
