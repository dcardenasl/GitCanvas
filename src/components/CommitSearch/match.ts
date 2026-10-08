import type { CommitInfo } from "../../bindings";

/**
 * Whether a commit matches a query.
 *
 * A full or partial SHA matches by prefix, the way `git show` accepts one;
 * everything else matches case-insensitively against the message and the
 * author. Deliberately not fuzzy: in a list where every row starts with
 * `feat(` or `fix(`, fuzzy matching returns everything and ranks by accident.
 */
export function matches(commit: CommitInfo, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return false;

  if (commit.id.startsWith(needle)) return true;

  return (
    commit.message.toLowerCase().includes(needle) ||
    commit.author_name.toLowerCase().includes(needle) ||
    commit.author_email.toLowerCase().includes(needle)
  );
}

/** Indices of every commit matching the query, in history order. */
export function findMatches(
  commits: readonly CommitInfo[],
  query: string,
): number[] {
  if (query.trim() === "") return [];
  const found: number[] = [];
  for (const [index, commit] of commits.entries()) {
    if (matches(commit, query)) found.push(index);
  }
  return found;
}
