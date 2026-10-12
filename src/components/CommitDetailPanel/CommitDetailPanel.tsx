import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { CommitInfo } from "../../bindings";
import { useCommitDiff } from "../../state/diff";
import { selectedFileSource, useSession } from "../../state/session";
import {
  ChangedFilesBrowser,
  type ChangedFilesGroup,
} from "../ChangedFilesBrowser/ChangedFilesBrowser";
import {
  authorInitials,
  formatCommitTime,
  shortId,
} from "../CommitTable/format";
import { DiffStat } from "../DiffStat/DiffStat";
import { ErrorMessage } from "../ErrorMessage";

import "./CommitDetailPanel.css";

/** Repository and commit whose metadata and changed files are shown. */
export interface CommitDetailPanelProps {
  readonly repositoryPath: string;
  readonly commit: CommitInfo;
}

/**
 * Metadata for the selected commit and the files it changed.
 *
 * The list is navigation, not content: choosing a file opens it in the centre
 * panel, where there is room to read it. Rendering every diff inline in the
 * narrow inspector, which this used to do, made long files unreadable and short
 * ones hard to find.
 */
export function CommitDetailPanel({
  repositoryPath,
  commit,
}: CommitDetailPanelProps) {
  const { t } = useTranslation("history");
  const selection = useSession((state) => state.selection);
  const selectedFilePath =
    selection.kind === "commit" ? selection.filePath : null;
  const fileSource = selectedFileSource(selection);
  const selectFile = useSession((state) => state.selectFile);

  const diff = useCommitDiff(repositoryPath, commit.id);
  const changedGroups = useMemo<ChangedFilesGroup[]>(
    () =>
      diff.data === undefined
        ? []
        : [
            {
              files: diff.data.files,
              source: "commit",
              listLabel: t("detail.changedFiles"),
            },
          ],
    [diff.data, t],
  );

  return (
    <aside className="detail-panel" aria-label={t("detail.aria")}>
      <p className="detail-panel__hash">
        {t("detail.commit")} <span>{shortId(commit.id)}</span>
        {commit.parents[0] !== undefined && (
          <>
            {" "}
            · {t("detail.parent")} {shortId(commit.parents[0])}
          </>
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
        <p className="state detail-panel__state">{t("detail.reading")}</p>
      )}

      {diff.error !== null && (
        <div className="state detail-panel__state" role="alert">
          <ErrorMessage error={diff.error} />
        </div>
      )}

      {diff.data !== undefined && (
        <>
          {diff.data.is_merge && (
            <p className="detail-panel__note">{t("detail.mergeNote")}</p>
          )}
          <p className="detail-panel__files-label">
            {t("detail.filesChanged", { count: diff.data.files.length })}
            {" · "}
            <DiffStat
              insertions={diff.data.insertions}
              deletions={diff.data.deletions}
            />
          </p>
        </>
      )}

      <ChangedFilesBrowser
        key={commit.id}
        allCommitFiles={{
          repositoryPath,
          commitId: commit.id,
        }}
        groups={changedGroups}
        selectedFilePath={selectedFilePath}
        selectedFileSource={fileSource}
        onOpen={(path, source, snapshot) => {
          selectFile(path, source, snapshot ? "snapshot" : "diff");
        }}
      />
    </aside>
  );
}
