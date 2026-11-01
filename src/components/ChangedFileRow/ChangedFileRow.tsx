import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FileChange } from "../../bindings";
import type { ChangedFile } from "../../lib/changedFiles";
import type { FileHistoryUnavailable } from "../../state/fileHistory";
import { ChangeMark, type ChangeKind } from "../ChangeMark";
import { ContextMenu } from "../ContextMenu";
import { DiffStat } from "../DiffStat/DiffStat";

const CHANGE_KIND: Record<FileChange, ChangeKind> = {
  Added: "added",
  Modified: "modified",
  Deleted: "deleted",
  Renamed: "renamed",
  Copied: "copied",
  TypeChanged: "typechanged",
  Other: "other",
};

/** The row's action that opens the file's history, and why it cannot be used now. */
export interface FileRowHistory {
  readonly unavailable: FileHistoryUnavailable | null;
  readonly onOpen: () => void;
}

interface ChangedFileRowProps {
  readonly file: ChangedFile | null;
  readonly path: string;
  readonly selected: boolean;
  readonly onOpen: () => void;
  readonly showDirectory?: boolean;
  readonly history?: FileRowHistory | undefined;
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
  history,
}: ChangedFileRowProps) {
  const { t } = useTranslation(["files", "fileHistory"]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <li className={history === undefined ? undefined : "file-row-item"}>
      <button
        type="button"
        className={selected ? "file-row file-row--selected" : "file-row"}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      >
        {file === null ? (
          <ChangeMark kind="unchanged" label={t("change.unchanged")} />
        ) : (
          <ChangeMark
            kind={CHANGE_KIND[file.change]}
            label={t(`change.${file.change}`)}
          />
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
      {history !== undefined && (
        <button
          type="button"
          className="file-row__more"
          aria-label={t("fileHistory:moreFor", { path })}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          disabled={history.unavailable !== null}
          title={
            history.unavailable === null
              ? undefined
              : t(`fileHistory:unavailable.${history.unavailable}`)
          }
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({ x: bounds.left, y: bounds.bottom });
          }}
        >
          <span className="file-row__dot" aria-hidden="true" />
          <span className="file-row__dot" aria-hidden="true" />
          <span className="file-row__dot" aria-hidden="true" />
        </button>
      )}
      {history !== undefined && menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: t("fileHistory:open"),
              onSelect: () => {
                setMenu(null);
                history.onOpen();
              },
            },
          ]}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </li>
  );
}
