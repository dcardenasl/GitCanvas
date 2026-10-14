import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useBranches, useTags } from "../../state/refs";
import { ContextMenu } from "../ContextMenu";
import { selectedCommitId as getSelectedCommitId } from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
} from "../../state/workspace";

import "./Sidebar.css";

/** Display and navigation data for one branch or tag. */
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
  /** Set for local branches that can be checked out from this list. */
  readonly checkoutBranch?: string;
}

/** Visibility and optional local-branch checkout behavior of the sidebar. */
export interface SidebarProps {
  /**
   * Collapses the sidebar without removing it from the grid.
   *
   * Styled to zero width rather than unmounted: a removed grid child shifts
   * every later one into the wrong column.
   */
  readonly hidden?: boolean;
  /**
   * Switches to a local branch. When omitted the list only navigates, and
   * offers no checkout.
   */
  readonly onCheckout?: (branch: string) => void;
}

/** Branch and tag navigation for the open repository. */
export function Sidebar({ hidden = false, onCheckout }: SidebarProps) {
  const { t } = useTranslation("refs");
  const repository = useActiveRepository();
  const selectedCommitId = useNavigation(getSelectedCommitId);

  const { revealCommit } = useNavigationActions();
  const path = repository?.path ?? null;

  const branches = useBranches(path);
  const tags = useTags(path);

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    branch: string;
  } | null>(null);
  const openMenu = (x: number, y: number, branch: string) => {
    setMenu({ x, y, branch });
  };

  const local = (branches.data ?? []).filter((branch) => !branch.is_remote);
  const remote = (branches.data ?? []).filter((branch) => branch.is_remote);

  return (
    <aside className="sidebar" hidden={hidden} aria-label={t("aria")}>
      <RefGroup
        label={t("groups.local")}
        refs={local.map((branch) => ({
          name: branch.name,
          commitId: branch.target,
          isHead: branch.is_head,
          ...(onCheckout !== undefined && !branch.is_head
            ? { checkoutBranch: branch.name }
            : {}),
        }))}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
        onMenu={openMenu}
      />

      <RefGroup
        label={t("groups.remote")}
        refs={remote.map((branch) => ({
          name: branch.name,
          commitId: branch.target,
        }))}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
      />

      <RefGroup
        label={t("groups.tags")}
        monospace
        refs={(tags.data ?? []).map((tag) => ({
          name: tag.name,
          commitId: tag.commit_id,
        }))}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
      />

      {menu !== null && onCheckout !== undefined && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
          }}
          items={[
            {
              label: t("checkout", { branch: menu.branch }),
              onSelect: () => {
                onCheckout(menu.branch);
              },
            },
          ]}
        />
      )}
    </aside>
  );
}

interface RefGroupProps {
  readonly label: string;
  readonly refs: readonly RefTarget[];
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  /** Opens the checkout menu for a branch, at the pointer. */
  readonly onMenu?: (x: number, y: number, branch: string) => void;
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
  onMenu,
  monospace = false,
}: RefGroupProps) {
  const { t } = useTranslation("refs");
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
                    ? t(
                        entry.checkoutBranch === undefined
                          ? "goTo"
                          : "goToWithCheckout",
                        { name: entry.name },
                      )
                    : t("notCommit", { name: entry.name })
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
                onKeyDown={(event) => {
                  if (
                    entry.checkoutBranch === undefined ||
                    onMenu === undefined ||
                    (event.key !== "ContextMenu" &&
                      !(event.key === "F10" && event.shiftKey))
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onMenu(bounds.left, bounds.bottom, entry.checkoutBranch);
                }}
                onContextMenu={(event) => {
                  if (
                    entry.checkoutBranch === undefined ||
                    onMenu === undefined
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onMenu(event.clientX, event.clientY, entry.checkoutBranch);
                }}
              >
                <span className="sidebar__name">{entry.name}</span>
                {entry.isHead === true && (
                  <span className="sidebar__badge" aria-label={t("headLabel")}>
                    {t("head")}
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
