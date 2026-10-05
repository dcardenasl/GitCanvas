import { useEffect, useMemo, useRef, useState } from "react";

import type { CommitInfo } from "../../bindings";

import { findMatches } from "./match";

import "./CommitSearch.css";

/** Loaded commits to search and callback for navigating to a match. */
export interface CommitSearchProps {
  readonly commits: readonly CommitInfo[];
  /** Called with the commit to select and scroll to. */
  readonly onGo: (commitId: string) => void;
}

/**
 * Finds a commit by message, author or SHA.
 *
 * Searches only the history already loaded, and says so: claiming to search a
 * repository while silently looking at the first few hundred commits would be
 * worse than an honest count. Enter walks the matches, so a query with many
 * hits is still navigable.
 */
export function CommitSearch({ commits, onGo }: CommitSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * The walked position is stored with the query it belongs to, so a new query
   * starts from the top by derivation rather than by an effect that resets it.
   * Resetting in an effect renders once with the previous position before
   * correcting itself, which is both a wasted render and a visible flash of
   * the wrong count.
   */
  const [cursor, setCursor] = useState({ query: "", position: 0 });
  const position = cursor.query === query ? cursor.position : 0;

  const found = useMemo(() => findMatches(commits, query), [commits, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function go(step: number) {
    if (found.length === 0) return;
    const next = (position + step + found.length) % found.length;
    setCursor({ query, position: next });

    const index = found[next];
    const commit = index === undefined ? undefined : commits[index];
    if (commit !== undefined) onGo(commit.id);
  }

  const status =
    query.trim() === ""
      ? ""
      : found.length === 0
        ? "sin coincidencias"
        : `${String(position + 1)} de ${String(found.length)}`;

  return (
    <div className="commit-search">
      <input
        ref={inputRef}
        type="search"
        className="commit-search__input"
        value={query}
        placeholder="Buscar commit, autor o hash"
        aria-label="Buscar en el historial cargado"
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            go(event.shiftKey ? -1 : 1);
          }
          if (event.key === "Escape") {
            setQuery("");
            event.currentTarget.blur();
          }
        }}
      />
      {status !== "" && (
        <span
          className={
            found.length === 0
              ? "commit-search__status commit-search__status--empty"
              : "commit-search__status"
          }
          role="status"
        >
          {status}
        </span>
      )}
    </div>
  );
}
