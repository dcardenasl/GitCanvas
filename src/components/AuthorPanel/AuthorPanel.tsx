import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAuthorCatalog,
  useAuthorCommitIds,
  useSelectedAuthor,
  adjacentAuthorCommit,
} from "../../state/authors";
import { selectedCommitId as getSelectedCommitId } from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
} from "../../state/workspace";

import "./AuthorPanel.css";

/** Author catalog, selection and keyboard-accessible commit navigation. */
export function AuthorPanel() {
  const { t } = useTranslation("authors");
  const repository = useActiveRepository();
  const root = repository?.path ?? null;
  const catalog = useAuthorCatalog(root);
  const { author, select } = useSelectedAuthor(root);
  const commits = useAuthorCommitIds(root, author);
  const currentCommitId = useNavigation(getSelectedCommitId);
  const { revealCommit } = useNavigationActions();
  const [search, setSearch] = useState("");
  const [autoContinue, setAutoContinue] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [status, setStatus] = useState("");
  const [navigationFailed, setNavigationFailed] = useState(false);
  const fetchNextAuthorPage = catalog.fetchNextPage;
  const hasNextAuthorPage = catalog.hasNextPage;
  const isFetchingNextAuthorPage = catalog.isFetchingNextPage;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const authors = useMemo(
    () =>
      catalog.authors.filter(({ author: entry }) =>
        `${entry.name}\n${entry.email}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      ),
    [catalog.authors, normalizedSearch],
  );

  useEffect(() => {
    if (!autoContinue || !hasNextAuthorPage || isFetchingNextAuthorPage) return;
    void fetchNextAuthorPage();
  }, [
    autoContinue,
    fetchNextAuthorPage,
    hasNextAuthorPage,
    isFetchingNextAuthorPage,
  ]);

  async function navigate(direction: "previous" | "next"): Promise<void> {
    if (author === null || currentCommitId === null || navigating) return;
    setNavigating(true);
    setStatus("");
    setNavigationFailed(false);
    try {
      const id = await adjacentAuthorCommit(
        commits,
        currentCommitId,
        direction,
      );
      if (id === null) {
        setStatus(
          direction === "previous"
            ? t("navigation.first")
            : t("navigation.last"),
        );
      } else {
        revealCommit(id);
        setStatus(
          t("navigation.moved", { direction: t(`navigation.${direction}`) }),
        );
      }
    } catch {
      setNavigationFailed(true);
      setStatus(t("navigation.failed"));
    } finally {
      setNavigating(false);
    }
  }

  return (
    <section
      className="author-panel"
      aria-labelledby="author-panel-title"
      onKeyDown={(event) => {
        const target = event.target;
        if (
          !event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          (target instanceof HTMLElement &&
            (target.isContentEditable ||
              target.closest("input, textarea, select") !== null))
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          void navigate(event.key === "ArrowLeft" ? "previous" : "next");
        }
      }}
    >
      <h2 id="author-panel-title" className="author-panel__title">
        {t("title")}
      </h2>
      <label
        className="author-panel__search-label"
        htmlFor="author-panel-search"
      >
        {t("search.label")}
      </label>
      <input
        id="author-panel-search"
        className="author-panel__search"
        type="search"
        value={search}
        placeholder={t("search.placeholder")}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
        }}
      />
      <p className="author-panel__progress" role="status" aria-live="polite">
        {catalog.complete
          ? t("catalog.complete", { scanned: catalog.scanned })
          : !autoContinue
            ? t("catalog.paused", { scanned: catalog.scanned })
            : t("catalog.progress", { scanned: catalog.scanned })}
      </p>
      {catalog.incompleteReason !== null && (
        <p className="author-panel__notice" role="status">
          {t(`catalog.incomplete.${catalog.incompleteReason}`)}
        </p>
      )}
      {catalog.isError && (
        <p className="author-panel__notice" role="status">
          {t("catalog.failed")}
        </p>
      )}
      {!catalog.complete && !catalog.isError && (
        <button
          type="button"
          className="author-panel__load-more"
          onClick={() => {
            setAutoContinue((continuing) => !continuing);
          }}
        >
          {autoContinue ? t("catalog.cancel") : t("catalog.continue")}
        </button>
      )}
      <ul className="author-panel__list" aria-label={t("list.label")}>
        {authors.map((entry) => {
          const selected =
            author?.name === entry.author.name &&
            author.email === entry.author.email;
          return (
            <li key={`${entry.author.name}\n${entry.author.email}`}>
              <button
                type="button"
                className="author-panel__author"
                aria-pressed={selected}
                onClick={() => {
                  select(selected ? null : entry.author);
                  setStatus("");
                }}
              >
                <span className="author-panel__identity">
                  <span className="author-panel__name">
                    {entry.author.name}
                  </span>
                  <span className="author-panel__email">
                    {entry.author.email}
                  </span>
                </span>
                <span className="author-panel__count">
                  {t("list.commits", { count: entry.commits })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {authors.length === 0 && (
        <p className="author-panel__notice" role="status">
          {normalizedSearch === "" ? t("list.empty") : t("list.noMatches")}
        </p>
      )}
      <div
        className="author-panel__navigation"
        aria-label={t("navigation.label")}
      >
        <button
          type="button"
          className="author-panel__nav-button"
          aria-keyshortcuts="Alt+ArrowLeft"
          disabled={author === null || currentCommitId === null || navigating}
          onClick={() => {
            void navigate("previous");
          }}
        >
          {t("navigation.previous")}
        </button>
        <button
          type="button"
          className="author-panel__nav-button"
          aria-keyshortcuts="Alt+ArrowRight"
          disabled={author === null || currentCommitId === null || navigating}
          onClick={() => {
            void navigate("next");
          }}
        >
          {t("navigation.next")}
        </button>
      </div>
      <p className="author-panel__keyboard-hint">
        {t("navigation.keyboardHint")}
      </p>
      <p
        className="author-panel__status"
        role={navigationFailed ? "alert" : "status"}
        aria-label={t("navigation.statusLabel")}
        aria-live="polite"
      >
        {status}
      </p>
    </section>
  );
}
