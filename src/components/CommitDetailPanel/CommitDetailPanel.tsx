import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { CommitInfo } from "../../bindings";
import { getCommitDiff } from "../../lib/ipc";
import {
  authorInitials,
  formatCommitTime,
  shortId,
} from "../CommitTable/format";
import { DiffViewer } from "../DiffViewer";

import "./CommitDetailPanel.css";

export interface CommitDetailPanelProps {
  readonly repositoryPath: string;
  readonly commit: CommitInfo;
}

/** Metadata and changes for the selected commit. */
export function CommitDetailPanel({
  repositoryPath,
  commit,
}: CommitDetailPanelProps) {
  const [expandPath, setExpandPath] = useState<string | null>(null);

  const diff = useQuery({
    queryKey: ["diff", repositoryPath, commit.id, expandPath],
    queryFn: () =>
      getCommitDiff(repositoryPath, {
        commit_id: commit.id,
        expand_path: expandPath,
      }),
    staleTime: Infinity,
  });

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
        <p className="detail-panel__state">Leyendo el diff…</p>
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

          {diff.data.files.map((file) => (
            <section key={file.path} className="detail-panel__file">
              <header className="detail-panel__file-head">
                <span className="detail-panel__file-path" title={file.path}>
                  {file.old_path !== null && (
                    <span className="detail-panel__old-path">
                      {file.old_path} →{" "}
                    </span>
                  )}
                  {file.path}
                </span>
                <span className="detail-panel__file-stat">
                  +{file.insertions} −{file.deletions}
                </span>
              </header>
              <DiffViewer
                file={file}
                expanding={diff.isFetching && expandPath === file.path}
                onExpand={setExpandPath}
              />
            </section>
          ))}
        </>
      )}
    </aside>
  );
}
