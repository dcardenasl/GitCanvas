import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { BranchInfo } from "../../bindings";
import type { RepositoryWorktree } from "../../bindings";
import { openProjectAt } from "../../state/openProject";
import { useGraphModel } from "../../state/graph";
import { graphColor } from "../../lib/graph-layout/colors";
import { useThemePreferences } from "../../state/themePreferences";
import { ErrorMessage } from "../ErrorMessage";
import { BranchColorPicker } from "./BranchColorPicker";
import { ContextMenu } from "../ContextMenu";
import { formatCommitTime } from "../CommitTable/format";
import { selectedCommitId as getSelectedCommitId } from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
  useWorkspace,
} from "../../state/workspace";

import "./Sidebar.css";

const NO_EXCLUSIONS: readonly string[] = [];
const NO_BRANCHES: readonly BranchInfo[] = [];
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

/** Display and navigation data for one branch or tag. */
export interface RefTarget {
  /** Display name of the ref. */
  readonly name: string;
  readonly referenceId: string;
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
  readonly commitTime?: string | null;
  /** Set for local branches that can be checked out from this list. */
  readonly checkoutBranch?: string;
  readonly occupiedWorktree?: RepositoryWorktree;
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
    target: RefTarget;
  } | null>(null);
  const [palette, setPalette] = useState<BranchInfo | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const search = useWorkspace((state) =>
    path === null ? "" : (state.referenceSearches[path] ?? ""),
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
  const selected = new Set(
    allReferenceIds.filter((id) => !excluded.includes(id)),
  );
  const matchingReferenceIds = allReferenceIds.filter((referenceId) => {
    if (search === "") return true;
    const name =
      referenceId === "HEAD"
        ? "HEAD"
        : referenceId.replace(/^refs\/(heads|remotes|tags)\//, "");
    return name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  });
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
  const filterGroup = (items: readonly RefTarget[], label: string) => (
    <RefGroup
      label={label}
      refs={items}
      selectedCommitId={selectedCommitId}
      onOpen={revealCommit}
      onMenu={openMenu}
      search={search}
      selectedReferences={selected}
      collapsed={collapsed[label] ?? false}
      onCollapse={() => {
        setCollapsed((value) => ({
          ...value,
          [label]: !(value[label] ?? false),
        }));
      }}
      onToggle={toggleReference}
      onToggleMany={toggleReferences}
    />
  );
  const local = branches
    .filter((branch) => !branch.is_remote && !branch.is_symbolic)
    .sort(
      (a, b) =>
        Number(b.is_head) - Number(a.is_head) ||
        compareNames(a.full_name, b.full_name),
    );
  const remote = branches
    .filter((branch) => branch.is_remote && !branch.is_symbolic)
    .sort((a, b) => compareNames(a.full_name, b.full_name));
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
  const entry = (branch: BranchInfo): RefTarget => {
    const occupied = graph.worktrees.data?.worktrees.find(
      (tree) =>
        tree.root !== path && worktreeUsesBranch(tree, branch.full_name),
    );
    const branchAvailabilityKnown =
      graph.worktrees.data?.worktrees.every(
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
  };

  return (
    <aside className="sidebar" hidden={hidden} aria-label={t("aria")}>
      <div className="sidebar__filters">
        <label className="sidebar__search-label" htmlFor="reference-search">
          {t("search")}
        </label>
        <input
          id="reference-search"
          type="search"
          value={search}
          placeholder={t("searchPlaceholder")}
          onChange={(event) => {
            if (path !== null) setReferenceSearch(path, event.target.value);
          }}
        />
        <button
          type="button"
          disabled={allReferenceIds.length === 0}
          onClick={showAllMatching}
        >
          {t("showAll")}
        </button>
        <button
          type="button"
          disabled={allReferenceIds.length === 0}
          onClick={showAllMatching}
        >
          {t("resetFilters")}
        </button>
        <button
          type="button"
          disabled={
            path === null ||
            (useWorkspace.getState().referenceFilterUndo[path]?.length ?? 0) ===
              0
          }
          onClick={() => {
            if (path !== null) undoFilters(path);
          }}
        >
          {t("undo")}
        </button>
        <label>
          <input
            type="checkbox"
            checked={selected.has("HEAD")}
            onChange={(event) => {
              toggleReference("HEAD", event.target.checked);
            }}
          />
          {t("headFilter")}
        </label>
      </div>
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
      {graph.worktrees.data !== undefined && (
        <section
          className="sidebar__worktrees"
          aria-label={t("worktrees.aria")}
        >
          <div className="sidebar__label">
            <button
              type="button"
              aria-expanded={!collapsed.worktrees}
              onClick={() => {
                setCollapsed((value) => ({
                  ...value,
                  worktrees: !value.worktrees,
                }));
              }}
            >
              {t("worktrees.title")}
            </button>
            <span>{graph.worktrees.data.worktrees.length}</span>
            <button
              type="button"
              aria-label={t("worktrees.refresh")}
              title={t("worktrees.refresh")}
              onClick={() => void graph.worktrees.refetch()}
            >
              {t("worktrees.refreshShort")}
            </button>
          </div>
          {worktreeError !== null && (
            <div role="alert">
              <ErrorMessage error={worktreeError} />
            </div>
          )}
          {!collapsed.worktrees && (
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
                    <span className="sidebar__path">{tree.root}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {graph.worktrees.error !== null && (
        <div role="alert">
          <ErrorMessage error={graph.worktrees.error} />
          <button type="button" onClick={() => void graph.worktrees.refetch()}>
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
      {filterGroup(local.map(entry), t("groups.local"))}
      {filterGroup(remote.map(entry), t("groups.remote"))}
      {filterGroup(
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
        t("groups.tags"),
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
    </aside>
  );
}

interface RefGroupProps {
  readonly label: string;
  readonly refs: readonly RefTarget[];
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  /** Opens reference actions at the pointer. */
  readonly onMenu?: (x: number, y: number, target: RefTarget) => void;
  readonly monospace?: boolean;
  readonly search: string;
  readonly selectedReferences: ReadonlySet<string>;
  readonly collapsed: boolean;
  readonly onCollapse: () => void;
  readonly onToggle: (referenceId: string, checked: boolean) => void;
  readonly onToggleMany: (
    referenceIds: readonly string[],
    checked: boolean,
  ) => void;
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
  search,
  selectedReferences,
  collapsed,
  onCollapse,
  onToggle,
  onToggleMany,
}: RefGroupProps) {
  const { t } = useTranslation("refs");
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const visible = refs.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  if (visible.length === 0) return null;
  const selectedCount = visible.filter((entry) =>
    selectedReferences.has(entry.referenceId),
  ).length;
  const folderPrefixes = [
    ...new Set(
      visible.flatMap((entry) => {
        const parts = entry.name.split("/");
        return parts
          .slice(0, -1)
          .map((_part, index) => parts.slice(0, index + 1).join("/"));
      }),
    ),
  ].sort(compareNames);
  const visibleFolders = folderPrefixes.filter((prefix) => {
    const parts = prefix.split("/");
    return (
      search !== "" ||
      !parts
        .slice(0, -1)
        .some(
          (_part, index) =>
            collapsedFolders[parts.slice(0, index + 1).join("/")],
        )
    );
  });
  const visibleEntries = visible.filter((entry) => {
    const parts = entry.name.split("/");
    return (
      search !== "" ||
      !parts
        .slice(0, -1)
        .some(
          (_part, index) =>
            collapsedFolders[parts.slice(0, index + 1).join("/")],
        )
    );
  });
  const sectionCollapsed = collapsed && search === "";

  return (
    <>
      <div className="sidebar__label">
        <input
          type="checkbox"
          aria-label={t("toggleGroup", { group: label })}
          checked={selectedCount === visible.length}
          ref={(element) => {
            if (element !== null)
              element.indeterminate =
                selectedCount > 0 && selectedCount < visible.length;
          }}
          onChange={(event) => {
            onToggleMany(
              visible.map((entry) => entry.referenceId),
              event.target.checked,
            );
          }}
        />
        <button
          type="button"
          aria-expanded={!sectionCollapsed}
          disabled={search !== ""}
          onClick={onCollapse}
        >
          {label}
        </button>
        <span
          aria-label={t("activeCount", {
            active: selectedCount,
            total: visible.length,
          })}
        >
          {selectedCount}/{visible.length}
        </span>
      </div>
      {!sectionCollapsed &&
        visibleFolders.map((prefix) => {
          const descendants = visible.filter((entry) =>
            entry.name.startsWith(`${prefix}/`),
          );
          const active = descendants.filter((entry) =>
            selectedReferences.has(entry.referenceId),
          ).length;
          const parts = prefix.split("/");
          return (
            <div
              className="sidebar__folder"
              key={`${label}/folder/${prefix}`}
              style={{
                marginInlineStart: `${String((parts.length - 1) * 12)}px`,
              }}
            >
              <input
                type="checkbox"
                aria-label={t("toggleFolder", { folder: prefix })}
                checked={active === descendants.length}
                ref={(element) => {
                  if (element !== null)
                    element.indeterminate =
                      active > 0 && active < descendants.length;
                }}
                onChange={(event) => {
                  onToggleMany(
                    descendants.map((entry) => entry.referenceId),
                    event.target.checked,
                  );
                }}
              />
              <button
                type="button"
                aria-expanded={search !== "" || !collapsedFolders[prefix]}
                disabled={search !== ""}
                onClick={() => {
                  setCollapsedFolders((current) => ({
                    ...current,
                    [prefix]: !current[prefix],
                  }));
                }}
              >
                {prefix}{" "}
                <span>
                  {active}/{descendants.length}
                </span>
              </button>
            </div>
          );
        })}
      {!sectionCollapsed && (
        <ul className="sidebar__list">
          {visibleEntries.map((entry) => {
            const reachable = entry.commitId !== null;
            const current = reachable && entry.commitId === selectedCommitId;

            return (
              <li key={`${label}/${entry.name}`} className="sidebar__row">
                <input
                  type="checkbox"
                  aria-label={t("toggleReference", { name: entry.name })}
                  checked={selectedReferences.has(entry.referenceId)}
                  onChange={(event) => {
                    onToggle(entry.referenceId, event.target.checked);
                  }}
                />
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={current ? "true" : undefined}
                  title={
                    reachable
                      ? entry.commitTime === undefined
                        ? t(
                            entry.checkoutBranch === undefined
                              ? "goTo"
                              : "goToWithCheckout",
                            { name: entry.name },
                          )
                        : t("tagCommitDate", {
                            date:
                              entry.commitTime === null
                                ? ""
                                : formatCommitTime(entry.commitTime),
                          })
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
                      onMenu === undefined ||
                      (event.key !== "ContextMenu" &&
                        !(event.key === "F10" && event.shiftKey))
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    onMenu(bounds.left, bounds.bottom, entry);
                  }}
                  onContextMenu={(event) => {
                    if (onMenu === undefined) {
                      return;
                    }
                    event.preventDefault();
                    onMenu(event.clientX, event.clientY, entry);
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
                  {entry.commitTime !== undefined &&
                    entry.commitTime !== null && (
                      <span
                        className="sidebar__date"
                        aria-label={t("tagCommitDate", {
                          date: formatCommitTime(entry.commitTime),
                        })}
                      >
                        {formatCommitTime(entry.commitTime)}
                      </span>
                    )}
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
                    <span
                      className="sidebar__badge"
                      aria-label={t("headLabel")}
                    >
                      {t("head")}
                    </span>
                  )}
                  {entry.occupiedWorktree !== undefined && (
                    <span
                      className="sidebar__badge"
                      title={entry.occupiedWorktree.root}
                    >
                      {t("worktrees.openElsewhere")}
                    </span>
                  )}
                </button>
                {onMenu !== undefined && (
                  <button
                    type="button"
                    className="sidebar__actions"
                    aria-label={t("actions", { branch: entry.name })}
                    aria-haspopup="menu"
                    onClick={(event) => {
                      const bounds =
                        event.currentTarget.getBoundingClientRect();
                      onMenu(bounds.left, bounds.bottom, entry);
                    }}
                  >
                    <span className="sidebar__dots" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
