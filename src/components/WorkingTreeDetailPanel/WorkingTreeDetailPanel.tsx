import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { selectedFileSource, useSession } from "../../state/session";
import { useWorktreeFiles, type LocalSide } from "../../state/worktree";
import { DiffStat } from "../DiffStat/DiffStat";
import { ErrorMessage } from "../ErrorMessage";
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
  const { t } = useTranslation(["files", "common"]);
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
  const fileSource = selectedFileSource(selection);
  const groups: ChangedFilesGroup[] = [];

  if (staged !== null && staged.files.length > 0) {
    groups.push(
      localFileGroup(t, "staged", staged, {
        loading: loadingSide === "staged",
        onLoadMore: () => {
          void loadMore("staged");
        },
      }),
    );
  }
  if (unstaged !== null && unstaged.files.length > 0) {
    groups.push(
      localFileGroup(t, "unstaged", unstaged, {
        loading: loadingSide === "unstaged",
        onLoadMore: () => {
          void loadMore("unstaged");
        },
      }),
    );
  }

  return (
    <aside className="detail-panel" aria-label={t("workingTree.aria")}>
      <p className="detail-panel__hash">{t("workingTree.eyebrow")}</p>
      <h2 className="detail-panel__summary">{t("workingTree.title")}</h2>
      <p className="detail-panel__local-hint">{t("workingTree.hint")}</p>

      {local.isPending && !localData && (
        <p className="state detail-panel__state">{t("workingTree.reading")}</p>
      )}
      {local.error !== null && groups.length === 0 && (
        <div className="state detail-panel__state" role="alert">
          <ErrorMessage error={local.error} />
        </div>
      )}

      {!local.isPending &&
        local.error === null &&
        stagedFiles.length === 0 &&
        unstagedFiles.length === 0 && (
          <p className="state detail-panel__state">{t("workingTree.none")}</p>
        )}

      {loadError !== null && (
        <div className="state detail-panel__state" role="alert">
          <ErrorMessage error={loadError} />
        </div>
      )}

      {groups.length > 0 && (
        <ChangedFilesBrowser
          groups={groups}
          selectedFilePath={selectedFilePath}
          selectedFileSource={fileSource}
          onOpen={(path, source) => {
            selectFile(path, source);
          }}
        />
      )}
    </aside>
  );
}

function localFileGroup(
  t: TFunction<readonly ["files", "common"]>,
  source: "staged" | "unstaged",
  side: LocalSide,
  more: { readonly loading: boolean; readonly onLoadMore: () => void },
): ChangedFilesGroup {
  const label = t(`workingTree.${source}`);

  return {
    files: side.files,
    source,
    sectionLabel: label,
    listLabel: t(`workingTree.${source}List`),
    heading: (
      <div className="detail-panel__local-group-head">
        <span>{label}</span>
        <span className="detail-panel__local-count">
          {side.totalFiles} ·{" "}
          <DiffStat insertions={side.insertions} deletions={side.deletions} />
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
            ? t("common:actions.loading")
            : t("workingTree.loadMore", { count: side.remaining })}
        </button>
      ) : null,
  };
}
