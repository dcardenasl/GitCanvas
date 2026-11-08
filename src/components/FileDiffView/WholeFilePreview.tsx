import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FileContentFields } from "../../bindings";
import { LineTable, parseWholeFile } from "../DiffViewer";

/** Source-independent rendering for bounded saved and local whole-file reads. */
export function WholeFilePreview({
  content,
  path,
  wrap,
  fetching,
  expanded,
  onExpand,
}: {
  readonly content: FileContentFields;
  readonly path: string;
  readonly wrap: boolean;
  readonly fetching: boolean;
  readonly expanded: boolean;
  readonly onExpand: () => void;
}) {
  const { t } = useTranslation(["files", "common", "stash"]);
  const lines = useMemo(
    () => (content.text === null ? [] : parseWholeFile(content.text)),
    [content.text],
  );
  if (content.omitted === "Binary")
    return (
      <p className="diff-viewer__notice">
        {t("diff.binaryFile", { count: Number(content.bytes) })}
      </p>
    );
  if (content.omitted === "TooLarge")
    return (
      <div className="diff-viewer__notice">
        <p className="diff-viewer__notice-text">
          {t("diff.tooLarge", { count: Number(content.bytes) })}
        </p>
        {expanded ? (
          <p>{t("stash:hardLimit")}</p>
        ) : (
          <button
            type="button"
            className="button"
            disabled={fetching}
            onClick={onExpand}
          >
            {fetching ? t("common:actions.loading") : t("diff.loadWhole")}
          </button>
        )}
      </div>
    );
  if (content.text === "")
    return <p className="state file-diff__state">{t("diff.emptyFile")}</p>;
  return lines.length === 0 ? null : (
    <LineTable lines={lines} wrap={wrap} highlight={{ path, mode: "source" }} />
  );
}
