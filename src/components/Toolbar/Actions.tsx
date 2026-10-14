import { Trans, useTranslation } from "react-i18next";

import { ErrorMessage } from "../ErrorMessage";

import { ConfirmDialog } from "./ConfirmDialog";
import type { NoticeContent } from "../../state/gitActionState";
import type { GitActions } from "../../state/gitActions";

import "./Actions.css";

/** Git operations and current branch displayed by the action controls. */
export interface ActionsProps {
  readonly actions: GitActions;
  readonly currentBranch: string | null;
}

/** How many conflicting paths the discard dialog lists before summarising. */
const CONFLICTS_SHOWN = 10;

/** Composes a notice's text in the active language from its code. */
function NoticeText({ content }: { readonly content: NoticeContent }) {
  const { t } = useTranslation("git");

  switch (content.code) {
    case "checkedOut":
      return t("notice.checkedOut", { branch: content.branch });
    case "upToDate":
      return t("notice.upToDate");
    case "fastForwarded":
      return t("notice.fastForwarded", { count: content.commits });
    case "diverged":
      return t("notice.diverged", {
        local: content.local,
        remote: content.remote,
      });
    case "noUpstream":
      return t("notice.noUpstream");
    case "pushRejected":
      return t("notice.pushRejected", {
        branch: content.branch,
        pull: t("pull.label"),
      });
    case "pushed":
      return t("notice.pushed", {
        branch: content.branch,
        remote: content.remote,
      });
    case "failed":
      return <ErrorMessage error={content.error} />;
  }
}

/** Pull and push buttons, and the confirmations and notices every action uses. */
export function Actions({ actions, currentBranch }: ActionsProps) {
  const { t } = useTranslation("git");
  const { notice, blocked, busy } = actions;

  return (
    <>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={actions.pull}
      >
        {actions.pulling ? t("pull.busy") : t("pull.label")}
      </button>
      <button
        type="button"
        className="button"
        disabled={busy || currentBranch === null}
        onClick={actions.requestPush}
      >
        {actions.pushing ? t("push.busy") : t("push.label")}
      </button>

      {notice !== null && (
        <div
          className={
            notice.tone === "error"
              ? "actions__notice actions__notice--error"
              : "actions__notice"
          }
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <div>
            <NoticeText content={notice.content} />
          </div>
          <button
            type="button"
            className="actions__notice-close"
            aria-label={t("notice.close")}
            onClick={actions.clearNotice}
          >
            ×
          </button>
        </div>
      )}

      {actions.confirmingPush && currentBranch !== null && (
        <ConfirmDialog
          title={t("push.dialogTitle")}
          body={
            <p>
              <Trans
                t={t}
                i18nKey="push.dialogBody"
                values={{ branch: currentBranch }}
                components={{ strong: <strong /> }}
              />
            </p>
          }
          confirmLabel={t("push.confirm")}
          onCancel={actions.cancelPush}
          onConfirm={actions.confirmPush}
        />
      )}

      {blocked !== null && (
        <ConfirmDialog
          title={t("blocked.title")}
          destructive
          body={
            <>
              <p>
                <Trans
                  t={t}
                  i18nKey="blocked.body"
                  values={{ branch: blocked.branch }}
                  components={{ strong: <strong /> }}
                />
              </p>
              <ul className="actions__conflicts">
                {blocked.conflicts.slice(0, CONFLICTS_SHOWN).map((conflict) => (
                  <li key={conflict.path}>
                    {conflict.path}
                    {conflict.staged && (
                      <span className="actions__staged">
                        {" "}
                        · {t("blocked.staged")}
                      </span>
                    )}
                  </li>
                ))}
                {blocked.conflicts.length > CONFLICTS_SHOWN && (
                  <li>
                    {t("blocked.more", {
                      count: blocked.conflicts.length - CONFLICTS_SHOWN,
                    })}
                  </li>
                )}
              </ul>
              <p>{t("blocked.irreversible")}</p>
            </>
          }
          confirmLabel={t("blocked.confirm")}
          onCancel={actions.cancelBlocked}
          onConfirm={actions.confirmDiscardAndCheckout}
        />
      )}
    </>
  );
}
