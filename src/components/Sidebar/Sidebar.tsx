import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { BranchInfo } from "../../bindings";
import { useGraphModel } from "../../state/graph";
import { graphColor } from "../../lib/graph-layout/colors";
import { useThemePreferences } from "../../state/themePreferences";
import { ErrorMessage } from "../ErrorMessage";
import { BranchColorPicker } from "./BranchColorPicker";
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
  readonly color?: string;
  readonly isPrincipal?: boolean;
  readonly isDefault?: boolean;
  readonly branch?: BranchInfo;
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

  const graph = useGraphModel(path);
  const theme = useThemePreferences((state) => state.resolvedTheme);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    branch: BranchInfo;
  } | null>(null);
  const [palette, setPalette] = useState<BranchInfo | null>(null);
  const openMenu = (x: number, y: number, branch: BranchInfo) => {
    setMenu({ x, y, branch });
  };
  const branches = graph.refs.data?.branches ?? [];
  const local = branches.filter(
    (branch) => !branch.is_remote && !branch.is_symbolic,
  );
  const remote = branches.filter(
    (branch) => branch.is_remote && !branch.is_symbolic,
  );
  const defaultTargets = new Set(
    branches
      .filter(
        (alias) =>
          alias.is_symbolic &&
          alias.is_remote &&
          alias.full_name.endsWith("/HEAD"),
      )
      .map((alias) => alias.symbolic_target),
  );
  const entry = (branch: BranchInfo): RefTarget => ({
    name: branch.name,
    commitId: branch.target,
    isHead: branch.is_head,
    isPrincipal:
      (graph.main?.status === "selected" ||
        graph.main?.status === "detected") &&
      graph.main.reference === branch.full_name,
    isDefault: defaultTargets.has(branch.full_name),
    color: graphColor(graph.colors.get(branch.full_name) ?? "stone", theme),
    branch,
    ...(!branch.is_remote && !branch.is_head && onCheckout !== undefined
      ? { checkoutBranch: branch.name }
      : {}),
  });

  return (
    <aside className="sidebar" hidden={hidden} aria-label={t("aria")}>
      {graph.refs.isLoading && <p role="status">{t("loading")}</p>}
      {graph.refs.error !== null && (
        <div role="alert">
          <ErrorMessage error={graph.refs.error} />
          <button
            type="button"
            onClick={() => {
              void graph.refs.refetch();
            }}
          >
            {t("retry")}
          </button>
        </div>
      )}
      {graph.main?.status === "missing" && (
        <p className="sidebar__notice" role="status">
          {t("principalMissing")}
        </p>
      )}
      {graph.main?.status === "choose" && branches.length > 0 && (
        <p className="sidebar__notice">{t("principalChoose")}</p>
      )}
      {branches.some(
        (branch) => branch.is_symbolic && branch.target === null,
      ) && <p role="status">{t("defaultMissing")}</p>}
      {graph.refs.isSuccess &&
        branches.length === 0 &&
        graph.refs.data.tags.length === 0 && <p>{t("empty")}</p>}
      <RefGroup
        label={t("groups.local")}
        refs={local.map(entry)}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
        onMenu={openMenu}
      />
      <RefGroup
        label={t("groups.remote")}
        refs={remote.map(entry)}
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
        onMenu={openMenu}
      />
      <RefGroup
        label={t("groups.tags")}
        refs={(graph.refs.data?.tags ?? []).map((tag) => ({
          name: tag.name,
          commitId: tag.commit_id,
        }))}
        monospace
        selectedCommitId={selectedCommitId}
        onOpen={revealCommit}
      />
      {palette !== null && (
        <BranchColorPicker
          branch={palette.name}
          current={graph.colors.get(palette.full_name) ?? "stone"}
          onChoose={(color) => {
            graph.changeColor(palette.full_name, color);
          }}
          onClose={() => {
            setPalette(null);
          }}
        />
      )}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
          }}
          items={[
            {
              label: t("changeColor"),
              onSelect: () => {
                setPalette(menu.branch);
              },
            },
            {
              label: t("choosePrincipal"),
              onSelect: () => {
                graph.choosePrincipal(menu.branch.full_name);
              },
            },
            ...(!menu.branch.is_remote &&
            !menu.branch.is_head &&
            onCheckout !== undefined
              ? [
                  {
                    label: t("checkout", { branch: menu.branch.name }),
                    startsGroup: true,
                    onSelect: () => {
                      onCheckout(menu.branch.name);
                    },
                  },
                ]
              : []),
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
  readonly onMenu?: (x: number, y: number, branch: BranchInfo) => void;
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
            <li key={`${label}/${entry.name}`} className="sidebar__row">
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
                    entry.branch === undefined ||
                    onMenu === undefined ||
                    (event.key !== "ContextMenu" &&
                      !(event.key === "F10" && event.shiftKey))
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onMenu(bounds.left, bounds.bottom, entry.branch);
                }}
                onContextMenu={(event) => {
                  if (entry.branch === undefined || onMenu === undefined) {
                    return;
                  }
                  event.preventDefault();
                  onMenu(event.clientX, event.clientY, entry.branch);
                }}
              >
                {entry.color !== undefined && (
                  <span
                    className="branch-color"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="sidebar__name">{entry.name}</span>
                {entry.isPrincipal === true && (
                  <span
                    className="sidebar__marker"
                    title={t("principalLabel")}
                    aria-label={t("principalLabel")}
                  >
                    {t("principalMark")}
                  </span>
                )}
                {entry.isDefault === true && (
                  <span
                    className="sidebar__marker"
                    title={t("defaultLabel")}
                    aria-label={t("defaultLabel")}
                  >
                    {t("defaultMark")}
                  </span>
                )}
                {entry.isHead === true && (
                  <span className="sidebar__badge" aria-label={t("headLabel")}>
                    {t("head")}
                  </span>
                )}
              </button>
              {entry.branch !== undefined && onMenu !== undefined && (
                <button
                  type="button"
                  className="sidebar__actions"
                  aria-label={t("actions", { branch: entry.name })}
                  aria-haspopup="menu"
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    if (entry.branch !== undefined)
                      onMenu(bounds.left, bounds.bottom, entry.branch);
                  }}
                >
                  <span className="sidebar__dots" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
