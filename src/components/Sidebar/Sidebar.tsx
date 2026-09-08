import { useQuery } from "@tanstack/react-query";

import { getBranches, getTags } from "../../lib/ipc";
import { useSession } from "../../state/session";

import "./Sidebar.css";

export interface RefTarget {
  /** Display name of the ref. */
  readonly name: string;
  /**
   * The commit this ref resolves to, or `null` when there is none.
   *
   * For a tag this is the resolved commit rather than the object the tag
   * points at: an annotated tag points at a tag object, and navigating to that
   * id would look for something the commit list does not contain.
   */
  readonly commitId: string | null;
  readonly isHead?: boolean;
}

export interface SidebarProps {
  /**
   * Collapses the sidebar without removing it from the grid.
   *
   * Styled to zero width rather than unmounted: a removed grid child shifts
   * every later one into the wrong column.
   */
  readonly hidden?: boolean;
}

/** Branch and tag navigation for the open repository. */
export function Sidebar({ hidden = false }: SidebarProps) {
  const repository = useSession((state) => state.repository);
  const selectedCommitId = useSession((state) => state.selectedCommitId);
  const revealCommit = useSession((state) => state.revealCommit);
  const path = repository?.path ?? null;

  const branches = useQuery({
    queryKey: ["branches", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getBranches(path);
    },
  });

  const tags = useQuery({
    queryKey: ["tags", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getTags(path);
    },
  });

  const local = (branches.data ?? []).filter((branch) => !branch.is_remote);
  const remote = (branches.data ?? []).filter((branch) => branch.is_remote);

  return (
    <aside className="sidebar" hidden={hidden} aria-label="Ramas y etiquetas">
      <RefGroup
        label="Local"
        refs={local.map((branch) => ({
          name: branch.name,
          commitId: branch.target,
          isHead: branch.is_head,
        }))}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
      />

      <RefGroup
        label="Remotas"
        refs={remote.map((branch) => ({
          name: branch.name,
          commitId: branch.target,
        }))}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
      />

      <RefGroup
        label="Etiquetas"
        monospace
        refs={(tags.data ?? []).map((tag) => ({
          name: tag.name,
          commitId: tag.commit_id,
        }))}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
      />
    </aside>
  );
}

interface RefGroupProps {
  readonly label: string;
  readonly refs: readonly RefTarget[];
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  readonly monospace?: boolean;
}

/**
 * One labelled list of refs.
 *
 * Every entry is a button: a ref is a place in the history, so selecting one
 * takes you to the commit it points at. A tag on an annotated object that is
 * not a commit has nowhere to go, and is disabled rather than silently inert.
 */
function RefGroup({
  label,
  refs,
  selectedCommitId,
  onOpen,
  monospace = false,
}: RefGroupProps) {
  if (refs.length === 0) return null;

  return (
    <>
      <p className="sidebar__label">{label}</p>
      <ul className="sidebar__list">
        {refs.map((entry) => {
          const reachable = entry.commitId !== null;
          const current = reachable && entry.commitId === selectedCommitId;

          return (
            <li key={`${label}/${entry.name}`}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={current ? "true" : undefined}
                title={
                  reachable
                    ? `Ir al último commit de ${entry.name}`
                    : `${entry.name} no apunta a un commit`
                }
                className={[
                  "sidebar__item",
                  entry.isHead === true ? "sidebar__item--head" : "",
                  monospace ? "sidebar__item--tag" : "",
                  current ? "sidebar__item--current" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (entry.commitId !== null) onOpen(entry.commitId);
                }}
              >
                <span className="sidebar__name">{entry.name}</span>
                {entry.isHead === true && (
                  <span className="sidebar__badge" aria-label="Rama activa">
                    HEAD
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
