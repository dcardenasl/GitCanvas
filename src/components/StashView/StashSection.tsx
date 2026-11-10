import { useEffect, useRef } from "react";
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
  const selectedEntry = useNavigation((nav) => nav.stash?.entry);
  const selected = selectedEntry?.stash_id;
  const { openStash } = useNavigationActions();
  const previousSelection = useRef(selected);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (selected === undefined && previousSelection.current !== undefined) {
      pendingFocus.current = previousSelection.current;
    }
    previousSelection.current = selected;
    if (
      selected !== undefined ||
      pendingFocus.current === null ||
      (query.first === undefined && query.error === null)
    )
      return;
    const row = document.querySelector<HTMLButtonElement>(
      `[data-stash-row="${pendingFocus.current}"]`,
    );
    const fallback = document.querySelector<HTMLElement>(
      search.trim() === ""
        ? "[data-stash-section-toggle]"
        : ".sidebar input[type=search]",
    );
    (row ?? fallback)?.focus();
    pendingFocus.current = null;
  }, [selected, query.first, query.error, search]);

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
          data-stash-section-toggle
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
                    selected === entry.stash_id &&
                    selectedEntry?.index === entry.index
                      ? "true"
                      : undefined
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
