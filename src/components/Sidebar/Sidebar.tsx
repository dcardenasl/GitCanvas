import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { BranchInfo } from "../../bindings";
import type { RepositoryWorktree } from "../../bindings";
import { openProjectAt } from "../../state/openProject";
import { useGraphModel } from "../../state/graph";
import { graphColor } from "../../lib/graph-layout/colors";
import { useThemePreferences } from "../../state/themePreferences";
import { ErrorMessage } from "../ErrorMessage";
import { BranchColorPicker } from "./BranchColorPicker";
import { RefGroup } from "./ReferenceTree";
import { SidebarHeader } from "./SidebarHeader";
import { ContextMenu } from "../ContextMenu";
import { selectedCommitId as getSelectedCommitId } from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
  useWorkspace,
} from "../../state/workspace";
import type { RefTarget } from "./refTypes";

import "./Sidebar.css";

const NO_EXCLUSIONS: readonly string[] = [];
const NO_BRANCHES: readonly BranchInfo[] = [];
const NO_COLLAPSED_NODES: readonly string[] = [];
const compareNames = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function worktreeUsesBranch(
  tree: RepositoryWorktree,
  reference: string,
): boolean {
  return (
    (tree.head.kind === "branch" || tree.head.kind === "unborn") &&
    tree.head.reference === reference
  );
}

export type { RefTarget } from "./refTypes";

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
    target: RefTarget;
  } | null>(null);
  const [optionsMenu, setOptionsMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [palette, setPalette] = useState<BranchInfo | null>(null);
  const collapsedKeys = useWorkspace((state) =>
    path === null
      ? NO_COLLAPSED_NODES
      : (state.referenceTreePreferences.find(
          (preference) => preference.path === path,
        )?.collapsed ?? NO_COLLAPSED_NODES),
  );
  const collapsed = useMemo(() => new Set(collapsedKeys), [collapsedKeys]);
  const setReferenceTreeCollapsed = useWorkspace(
    (state) => state.setReferenceTreeCollapsed,
  );
  const toggleCollapsed = (key: string) => {
    if (path === null) return;
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setReferenceTreeCollapsed(path, [...next]);
  };
  const expandAll = () => {
    if (path === null) return;
    setReferenceTreeCollapsed(path, []);
  };
  const collapseAll = () => {
    if (path === null) return;
    setReferenceTreeCollapsed(path, [
      "group:local",
      "group:remote",
      "group:tags",
      "section:worktrees",
    ]);
  };
  const search = useWorkspace((state) =>
    path === null
      ? ""
      : (state.referenceFilters.find((entry) => entry.path === path)?.search ??
        ""),
  );
  const setReferenceSearch = useWorkspace((state) => state.setReferenceSearch);
  const [worktreeError, setWorktreeError] = useState<Error | null>(null);
  const excluded = useWorkspace(
    (state) =>
      state.referenceFilters.find((entry) => entry.path === path)?.excluded ??
      NO_EXCLUSIONS,
  );
  const changeFilters = useWorkspace((state) => state.changeReferenceFilters);
  const undoFilters = useWorkspace((state) => state.undoReferenceFilters);
  const canUndoFilters = useWorkspace(
    (state) =>
      path !== null && (state.referenceFilterUndo[path]?.length ?? 0) > 0,
  );
  const openMenu = (x: number, y: number, target: RefTarget) => {
    setMenu({ x, y, target });
  };
  const branches = graph.refs.data?.branches ?? NO_BRANCHES;
  const allReferenceIds = useMemo(
    () => [
      "HEAD",
      ...branches
        .filter((branch) => !branch.is_symbolic)
        .map((branch) => branch.full_name),
      ...(graph.refs.data?.tags ?? []).map((tag) => `refs/tags/${tag.name}`),
    ],
    [branches, graph.refs.data?.tags],
  );
  const selected = useMemo(
    () => new Set(allReferenceIds.filter((id) => !excluded.includes(id))),
    [allReferenceIds, excluded],
  );
  const matchingReferenceIds = useMemo(() => {
    const normalizedSearch = search.toLocaleLowerCase();
    return allReferenceIds.filter((referenceId) => {
      if (normalizedSearch === "") return true;
      const name =
        referenceId === "HEAD"
          ? "HEAD"
          : referenceId.replace(/^refs\/(heads|remotes|tags)\//, "");
      return name.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [allReferenceIds, search]);
  const toggleReferences = (
    referenceIds: readonly string[],
    checked: boolean,
  ) => {
    if (path === null) return;
    const next = new Set(excluded);
    for (const referenceId of referenceIds) {
      if (checked) next.delete(referenceId);
      else next.add(referenceId);
    }
    changeFilters(path, [...next]);
  };
  const toggleReference = (referenceId: string, checked: boolean) => {
    toggleReferences([referenceId], checked);
  };
  const showAllMatching = () => {
    if (path === null) return;
    changeFilters(
      path,
      search === ""
        ? []
        : excluded.filter((id) => !matchingReferenceIds.includes(id)),
    );
  };
  const filterGroup = (
    items: readonly RefTarget[],
    label: string,
    groupId: "local" | "remote" | "tags",
    monospace = false,
  ) => (
    <RefGroup
      label={label}
      refs={items}
      selectedCommitId={selectedCommitId}
      onOpen={revealCommit}
      onMenu={openMenu}
      monospace={monospace}
      search={search}
      selectedReferences={selected}
      groupId={groupId}
      collapsed={collapsed.has(`group:${groupId}`)}
      onCollapse={() => {
        toggleCollapsed(`group:${groupId}`);
      }}
      collapsedFolders={collapsed}
      onToggleCollapse={toggleCollapsed}
      onToggle={toggleReference}
      onToggleMany={toggleReferences}
    />
  );
  const localBranches = useMemo(
    () =>
      branches
        .filter((branch) => !branch.is_remote && !branch.is_symbolic)
        .sort(
          (a, b) =>
            Number(b.is_head) - Number(a.is_head) ||
            compareNames(a.full_name, b.full_name),
        ),
    [branches],
  );
  const remoteBranches = useMemo(
    () =>
      branches
        .filter((branch) => branch.is_remote && !branch.is_symbolic)
        .sort((a, b) => compareNames(a.full_name, b.full_name)),
    [branches],
  );
  const defaultTargets = useMemo(
    () =>
      new Set(
        branches
          .filter(
            (alias) =>
              alias.is_symbolic &&
              alias.is_remote &&
              alias.full_name.endsWith("/HEAD"),
          )
          .map((alias) => alias.symbolic_target),
      ),
    [branches],
  );
  const worktrees = graph.worktrees.data?.worktrees;
  const entry = useCallback(
    (branch: BranchInfo): RefTarget => {
      const occupied = worktrees?.find(
        (tree) =>
          tree.root !== path && worktreeUsesBranch(tree, branch.full_name),
      );
      const branchAvailabilityKnown =
        worktrees?.every(
          (tree) => tree.root === path || tree.head.kind !== "unknown",
        ) ?? false;
      return {
        name: branch.name,
        referenceId: branch.full_name,
        commitId: branch.target,
        isHead: branch.is_head,
        isPrincipal:
          (graph.main?.status === "selected" ||
            graph.main?.status === "detected") &&
          graph.main.reference === branch.full_name,
        isDefault: defaultTargets.has(branch.full_name),
        color: graphColor(graph.colors.get(branch.full_name) ?? "stone", theme),
        branch,
        ...(occupied === undefined ? {} : { occupiedWorktree: occupied }),
        ...(!branch.is_remote &&
        !branch.is_head &&
        occupied === undefined &&
        branchAvailabilityKnown &&
        onCheckout !== undefined
          ? { checkoutBranch: branch.name }
          : {}),
      };
    },
    [
      defaultTargets,
      graph.colors,
      graph.main,
      onCheckout,
      path,
      theme,
      worktrees,
    ],
  );
  const local = useMemo(() => localBranches.map(entry), [entry, localBranches]);
  const remote = useMemo(
    () => remoteBranches.map(entry),
    [entry, remoteBranches],
  );
  const tags = useMemo(
    () =>
      [...(graph.refs.data?.tags ?? [])]
        .sort((a, b) => {
          const timeA =
            a.commit_time === null
              ? Number.NEGATIVE_INFINITY
              : Number(a.commit_time);
          const timeB =
            b.commit_time === null
              ? Number.NEGATIVE_INFINITY
              : Number(b.commit_time);
          return timeB - timeA || compareNames(a.name, b.name);
        })
        .map((tag) => ({
          name: tag.name,
          referenceId: `refs/tags/${tag.name}`,
          commitId: tag.commit_id,
          commitTime: tag.commit_time,
        })),
    [graph.refs.data?.tags],
  );

  const isSearchEmpty =
    search !== "" &&
    !local.some((b) =>
      b.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) &&
    !remote.some((b) =>
      b.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) &&
    !(graph.refs.data?.tags ?? []).some((tag) =>
      tag.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );

  return (
    <aside className="sidebar" hidden={hidden} aria-label={t("aria")}>
      <SidebarHeader
        search={search}
        headIncluded={selected.has("HEAD")}
        hasReferences={allReferenceIds.length > 0}
        canUndo={canUndoFilters}
        onSearchChange={(query) => {
          if (path !== null) setReferenceSearch(path, query);
        }}
        onHeadToggle={(included) => {
          toggleReference("HEAD", included);
        }}
        onShowAll={showAllMatching}
        onUndo={() => {
          if (path !== null) undoFilters(path);
        }}
        onOpenOptions={(x, y) => {
          setOptionsMenu({ x, y });
        }}
      />
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
      {isSearchEmpty && (
        <div className="sidebar__empty-search" role="status">
          <p className="sidebar__empty-text">{t("noMatches")}</p>
          <button
            type="button"
            className="sidebar__empty-clear-btn"
            onClick={() => {
              if (path !== null) setReferenceSearch(path, "");
            }}
          >
            {t("clearSearch")}
          </button>
        </div>
      )}
      {filterGroup(local, t("groups.local"), "local")}
      {filterGroup(remote, t("groups.remote"), "remote")}
      {filterGroup(tags, t("groups.tags"), "tags", true)}
      {graph.worktrees.data !== undefined && (
        <section
          className="sidebar__worktrees"
          aria-label={t("worktrees.aria")}
          aria-busy={graph.worktrees.isFetching}
        >
          <div className="sidebar__label">
            <button
              type="button"
              className="sidebar__section-toggle"
              aria-expanded={!collapsed.has("section:worktrees")}
              onClick={() => {
                toggleCollapsed("section:worktrees");
              }}
            >
              <span className="sidebar__chevron" aria-hidden="true">
                {collapsed.has("section:worktrees") ? "▸" : "▾"}
              </span>
              <span>{t("worktrees.title")}</span>
            </button>
            <span className="sidebar__count">
              {graph.worktrees.data.worktrees.length}
            </span>
            <span className="sidebar__actions-spacer" aria-hidden="true" />
            <button
              type="button"
              className="sidebar__icon-btn sidebar__actions"
              aria-label={t("worktrees.refresh")}
              title={t("worktrees.refresh")}
              disabled={graph.worktrees.isFetching}
              onClick={() => {
                void graph.worktrees.refetch();
              }}
            >
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9" />
                <path d="M2.5 12V8h4" />
              </svg>
            </button>
          </div>
          {worktreeError !== null && (
            <div role="alert">
              <ErrorMessage error={worktreeError} />
            </div>
          )}
          {!collapsed.has("section:worktrees") && (
            <ul className="sidebar__list">
              {graph.worktrees.data.worktrees.map((tree) => (
                <li className="sidebar__row" key={tree.root}>
                  <button
                    type="button"
                    className="sidebar__item sidebar__worktree"
                    disabled={tree.availability !== "available"}
                    aria-current={tree.is_active ? "true" : undefined}
                    title={tree.root}
                    onClick={() => {
                      setWorktreeError(null);
                      void openProjectAt(tree.root).catch((error: unknown) => {
                        setWorktreeError(
                          error instanceof Error
                            ? error
                            : new Error(String(error)),
                        );
                      });
                    }}
                  >
                    <span className="sidebar__name">{tree.name}</span>
                    <span className="sidebar__badge">
                      {tree.head.kind === "branch" ||
                      tree.head.kind === "unborn"
                        ? tree.head.reference.replace(/^refs\/heads\//, "")
                        : t(`worktrees.head.${tree.head.kind}`)}
                    </span>
                    {(tree.locked || tree.availability !== "available") && (
                      <span className="sidebar__badge">
                        {tree.locked
                          ? t("worktrees.locked", {
                              reason: tree.lock_reason ?? "",
                            })
                          : t(`worktrees.availability.${tree.availability}`)}
                      </span>
                    )}
                  </button>
                  <span
                    className="sidebar__actions-spacer"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {graph.worktrees.error !== null && (
        <div role="alert">
          <ErrorMessage error={graph.worktrees.error} />
          <button
            type="button"
            onClick={() => {
              void graph.worktrees.refetch();
            }}
          >
            {t("retry")}
          </button>
        </div>
      )}
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
              label: t("onlyThis"),
              onSelect: () => {
                toggleReferences(
                  matchingReferenceIds.filter(
                    (id) => id !== menu.target.referenceId,
                  ),
                  false,
                );
              },
            },
            ...(menu.target.commitId === null
              ? []
              : [
                  {
                    label: t("showAllAndLocate"),
                    onSelect: () => {
                      showAllMatching();
                      revealCommit(menu.target.commitId ?? "");
                    },
                  },
                ]),
            ...(menu.target.branch === undefined
              ? []
              : [
                  {
                    label: t("changeColor"),
                    onSelect: () => {
                      const branch = menu.target.branch;
                      if (branch !== undefined) setPalette(branch);
                    },
                  },
                  {
                    label: t("choosePrincipal"),
                    onSelect: () => {
                      const branch = menu.target.branch;
                      if (branch !== undefined)
                        graph.choosePrincipal(branch.full_name);
                    },
                  },
                ]),
            ...(menu.target.checkoutBranch !== undefined &&
            onCheckout !== undefined
              ? [
                  {
                    label: t("checkout", {
                      branch: menu.target.checkoutBranch,
                    }),
                    startsGroup: true,
                    onSelect: () => {
                      const branch = menu.target.checkoutBranch;
                      if (branch !== undefined) onCheckout(branch);
                    },
                  },
                ]
              : []),
            ...(menu.target.occupiedWorktree !== undefined
              ? [
                  {
                    label: t("worktrees.openOccupied"),
                    startsGroup: true,
                    onSelect: () => {
                      const occupied = menu.target.occupiedWorktree;
                      if (occupied === undefined) return;
                      void openProjectAt(occupied.root).catch(
                        (error: unknown) => {
                          setWorktreeError(
                            error instanceof Error
                              ? error
                              : new Error(String(error)),
                          );
                        },
                      );
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
      {optionsMenu !== null && (
        <ContextMenu
          x={optionsMenu.x}
          y={optionsMenu.y}
          onClose={() => {
            setOptionsMenu(null);
          }}
          items={[
            {
              label: t("expandAll"),
              onSelect: () => {
                expandAll();
              },
            },
            {
              label: t("collapseAll"),
              onSelect: () => {
                collapseAll();
              },
            },
            {
              label: t("resetFilters"),
              startsGroup: true,
              onSelect: () => {
                if (path !== null) {
                  setReferenceSearch(path, "");
                  changeFilters(path, []);
                }
              },
            },
          ]}
        />
      )}
    </aside>
  );
}
