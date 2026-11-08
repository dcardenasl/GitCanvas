import { useTranslation } from "react-i18next";
import { useStashes } from "../../state/stashes";
import { useNavigation, useNavigationActions } from "../../state/workspace";
import { ErrorMessage } from "../ErrorMessage";
import { stashDate } from "./metadata";
import "./StashView.css";

/** Inventory input bound to one verified worktree and its own search. */
export interface StashSectionProps {
  readonly root: string | null;
  readonly search: string;
  readonly collapsed: boolean;
  readonly onCollapse: () => void;
}

/** Independent read-only inventory; search never changes graph inclusion. */
export function StashSection({
  root,
  search,
  collapsed,
  onCollapse,
}: StashSectionProps) {
  const { t } = useTranslation(["stash", "common"]);
  const query = useStashes(root, search);
  const selected = useNavigation((nav) => nav.stash?.entry.stash_id);
  const { openStash } = useNavigationActions();
  const folded = collapsed && search.trim() === "";
  return (
    <section
      className="stash-section"
      aria-label={t("title")}
      aria-busy={query.isFetching || query.searching}
    >
      <div className="sidebar__label">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={!folded}
          disabled={search.trim() !== ""}
          onClick={onCollapse}
        >
          <span className="sidebar__chevron" aria-hidden="true">
            {folded ? "▸" : "▾"}
          </span>
          {t("title")}
        </button>
        <span className="sidebar__count">{query.first?.total ?? "…"}</span>
        <button
          type="button"
          className="stash-section__refresh"
          aria-label={t("refresh")}
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          ↻
        </button>
      </div>
      {!folded && (
        <>
          {(query.isPending || query.searching) && (
            <p role="status" className="sidebar__notice">
              {t("loading")}
            </p>
          )}
          {query.error !== null && (
            <div role="alert" className="sidebar__notice">
              <ErrorMessage error={query.error} />
              <button
                type="button"
                className="button"
                onClick={() => {
                  void query.refetch();
                }}
              >
                {t("common:actions.retry")}
              </button>
            </div>
          )}
          {query.first !== undefined &&
            query.entries.length === 0 &&
            !query.searching && (
              <p role="status" className="sidebar__notice">
                {t(query.first.total === 0 ? "empty" : "noMatches")}
              </p>
            )}
          <ul className="sidebar__list stash-section__list">
            {query.entries.map((entry) => (
              <li key={`${entry.stash_id}:${String(entry.index)}`}>
                <button
                  type="button"
                  className="stash-section__entry"
                  data-stash-row={entry.stash_id}
                  aria-current={
                    selected === entry.stash_id ? "true" : undefined
                  }
                  onClick={() => {
                    openStash(entry);
                    requestAnimationFrame(() => {
                      document
                        .querySelector<HTMLButtonElement>("[data-stash-close]")
                        ?.focus();
                    });
                  }}
                  title={entry.message ?? t("noMessage")}
                >
                  <span className="stash-section__alias">{`stash@{${String(entry.index)}}`}</span>
                  <span className="stash-section__message">
                    {entry.message ?? t("noMessage")}
                  </span>
                  <span className="stash-section__context">
                    {entry.branch.kind === "named"
                      ? entry.branch.name
                      : t(entry.branch.kind)}{" "}
                    · {stashDate(entry) ?? t("dateInvalid")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {query.hasNextPage && (
            <button
              type="button"
              className="button"
              disabled={query.isFetching}
              onClick={() => {
                void query.fetchNextPage();
              }}
            >
              {t("more")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
