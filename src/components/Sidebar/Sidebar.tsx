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
import { buildRefTree, type RefFolderNode, type RefLeafNode } from "./refTree";
import { VisibilityEye, type VisibilityState } from "./VisibilityEye";

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
  const [optionsMenu, setOptionsMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [palette, setPalette] = useState<BranchInfo | null>(null);
  const [collapsedByRepo, setCollapsedByRepo] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const collapsed = (path ? collapsedByRepo[path] : undefined) ?? {};
  const toggleCollapsed = (key: string) => {
    if (path === null) return;
    setCollapsedByRepo((current) => ({
      ...current,
      [path]: {
        ...(current[path] ?? {}),
        [key]: !(current[path]?.[key] ?? false),
      },
    }));
  };
  const expandAll = () => {
    if (path === null) return;
    setCollapsedByRepo((current) => ({
      ...current,
      [path]: {},
    }));
  };
  const collapseAll = () => {
    if (path === null) return;
    setCollapsedByRepo((current) => ({
      ...current,
      [path]: {
        [t("groups.local")]: true,
        [t("groups.remote")]: true,
        [t("groups.tags")]: true,
        worktrees: true,
      },
    }));
  };
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
  const filterGroup = (
    items: readonly RefTarget[],
    label: string,
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
      collapsed={collapsed[label] ?? false}
      onCollapse={() => {
        toggleCollapsed(label);
      }}
      collapsedFolders={collapsed}
      onToggleCollapse={toggleCollapsed}
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

  const undoDisabled =
    path === null ||
    (useWorkspace.getState().referenceFilterUndo[path]?.length ?? 0) === 0;

  return (
    <aside className="sidebar" hidden={hidden} aria-label={t("aria")}>
      <div className="sidebar__header">
        <div className="sidebar__title-row">
          <div className="sidebar__title-group">
            <h2 className="sidebar__title">{t("title")}</h2>
            <button
              type="button"
              className="sidebar__help-btn"
              aria-label={t("help.title")}
              title={t("help.summary")}
              aria-expanded={helpOpen}
              onClick={() => {
                setHelpOpen((open) => !open);
              }}
            >
              ?
            </button>
          </div>
          <div className="sidebar__header-actions">
            <button
              type="button"
              className="sidebar__header-btn"
              disabled={undoDisabled}
              aria-label={t("undo")}
              title={t("undo")}
              onClick={() => {
                if (path !== null) undoFilters(path);
              }}
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 6.5h7a3.5 3.5 0 0 1 3.5 3.5v0a3.5 3.5 0 0 1-3.5 3.5H6" />
                <path d="m5 4-2.5 2.5L5 9" />
              </svg>
            </button>
            <button
              type="button"
              className="sidebar__header-btn"
              aria-label={t("options")}
              title={t("options")}
              aria-haspopup="menu"
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setOptionsMenu({ x: bounds.left, y: bounds.bottom });
              }}
            >
              <span className="sidebar__dots" aria-hidden="true" />
            </button>
          </div>
        </div>

        {helpOpen && (
          <div
            className="sidebar__help-card"
            role="region"
            aria-label={t("help.title")}
          >
            <div className="sidebar__help-header">
              <strong>{t("help.title")}</strong>
              <button
                type="button"
                className="sidebar__help-close"
                aria-label={t("help.close")}
                onClick={() => {
                  setHelpOpen(false);
                }}
              >
                ×
              </button>
            </div>
            <ul className="sidebar__help-list">
              <li>
                <span className="sidebar__help-icon">▾ / ▸</span>
                <span>{t("help.expand")}</span>
              </li>
              <li>
                <span className="sidebar__help-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 16 16"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 4h10M8 4v9M6 13h4" />
                  </svg>
                </span>
                <span>{t("help.navigate")}</span>
              </li>
              <li>
                <span className="sidebar__help-icon">👁️</span>
                <span>{t("help.visibility")}</span>
              </li>
              <li>
                <span className="sidebar__help-icon">…</span>
                <span>{t("help.actions")}</span>
              </li>
            </ul>
            <p className="sidebar__help-note">{t("help.commitNote")}</p>
          </div>
        )}

        <div className="sidebar__search-row">
          <label
            className="sidebar__search-label visually-hidden"
            htmlFor="reference-search"
          >
            {t("search")}
          </label>
          <div className="sidebar__search-input-wrapper">
            <svg
              className="sidebar__search-icon"
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
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3.5 3.5" />
            </svg>
            <input
              id="reference-search"
              type="search"
              value={search}
              placeholder={t("searchPlaceholder")}
              onChange={(event) => {
                if (path !== null) setReferenceSearch(path, event.target.value);
              }}
            />
            {search !== "" && (
              <button
                type="button"
                className="sidebar__search-clear"
                aria-label={t("clearSearch")}
                title={t("clearSearch")}
                onClick={() => {
                  if (path !== null) setReferenceSearch(path, "");
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="sidebar__quick-bar">
          <label className="sidebar__head-label">
            <input
              type="checkbox"
              checked={selected.has("HEAD")}
              onChange={(event) => {
                toggleReference("HEAD", event.target.checked);
              }}
            />
            <span>{t("headFilter")}</span>
          </label>
          <button
            type="button"
            className="sidebar__quick-show-all"
            disabled={allReferenceIds.length === 0}
            onClick={showAllMatching}
          >
            {t("showAll")}
          </button>
        </div>
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
        true,
      )}
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
              aria-expanded={!collapsed.worktrees}
              onClick={() => {
                toggleCollapsed("worktrees");
              }}
            >
              <span className="sidebar__chevron" aria-hidden="true">
                {collapsed.worktrees ? "▸" : "▾"}
              </span>
              <span>{t("worktrees.title")}</span>
            </button>
            <span className="sidebar__count">
              {graph.worktrees.data.worktrees.length}
            </span>
            <button
              type="button"
              className="sidebar__icon-btn"
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

interface RefLeafRowProps {
  readonly leaf: RefLeafNode;
  readonly depth: number;
  readonly label: string;
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  readonly onMenu?:
    ((x: number, y: number, target: RefTarget) => void) | undefined;
  readonly monospace?: boolean | undefined;
  readonly selectedReferences: ReadonlySet<string>;
  readonly onToggle: (referenceId: string, checked: boolean) => void;
}

function RefLeafRow({
  leaf,
  depth,
  label,
  selectedCommitId,
  onOpen,
  onMenu,
  monospace = false,
  selectedReferences,
  onToggle,
}: RefLeafRowProps) {
  const { t } = useTranslation("refs");
  const entry = leaf.target;
  const reachable = entry.commitId !== null;
  const current = reachable && entry.commitId === selectedCommitId;
  const isIncluded = selectedReferences.has(entry.referenceId);

  return (
    <li
      key={`${label}/${entry.name}`}
      className={["sidebar__row", !isIncluded ? "sidebar__row--hidden" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{ paddingInlineStart: `${String(depth * 14 + 6)}px` }}
    >
      <button
        type="button"
        disabled={!reachable}
        aria-current={current ? "true" : undefined}
        aria-label={entry.name}
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
        <span className="sidebar__name" title={entry.name}>
          {leaf.name}
        </span>
        {entry.isPrincipal === true && (
          <span
            className="sidebar__badge sidebar__badge--principal"
            title={t("principalLabel")}
            aria-label={t("principalLabel")}
          >
            {t("principalBadge")}
          </span>
        )}
        {entry.isDefault === true && (
          <span
            className="sidebar__badge sidebar__badge--default"
            title={t("defaultLabel")}
            aria-label={t("defaultLabel")}
          >
            {t("defaultBadge")}
          </span>
        )}
        {entry.isHead === true && (
          <span
            className="sidebar__badge sidebar__badge--head"
            aria-label={t("headLabel")}
          >
            {t("head")}
          </span>
        )}
        {entry.occupiedWorktree !== undefined && (
          <span className="sidebar__badge" title={entry.occupiedWorktree.root}>
            {t("worktrees.openElsewhere")}
          </span>
        )}
      </button>
      <VisibilityEye
        state={isIncluded ? "visible" : "hidden"}
        label={t("toggleReference", { name: entry.name })}
        title={isIncluded ? t("visibleRefTooltip") : t("hiddenRefTooltip")}
        onToggle={() => {
          onToggle(entry.referenceId, !isIncluded);
        }}
      />
      {onMenu !== undefined && (
        <button
          type="button"
          className="sidebar__actions"
          aria-label={t("actions", { branch: entry.name })}
          aria-haspopup="menu"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            onMenu(bounds.left, bounds.bottom, entry);
          }}
        >
          <span className="sidebar__dots" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

interface RefFolderRowProps {
  readonly folder: RefFolderNode;
  readonly depth: number;
  readonly label: string;
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  readonly onMenu?:
    ((x: number, y: number, target: RefTarget) => void) | undefined;
  readonly monospace?: boolean | undefined;
  readonly search: string;
  readonly selectedReferences: ReadonlySet<string>;
  readonly collapsedFolders: Readonly<Record<string, boolean>>;
  readonly onToggleCollapse: (key: string) => void;
  readonly onToggle: (referenceId: string, checked: boolean) => void;
  readonly onToggleMany: (
    referenceIds: readonly string[],
    checked: boolean,
  ) => void;
}

function RefFolderRow({
  folder,
  depth,
  label,
  selectedCommitId,
  onOpen,
  onMenu,
  monospace,
  search,
  selectedReferences,
  collapsedFolders,
  onToggleCollapse,
  onToggle,
  onToggleMany,
}: RefFolderRowProps) {
  const { t } = useTranslation("refs");
  const folderKey = `${label}:${folder.fullPath}`;
  const isExpanded = search !== "" || !(collapsedFolders[folderKey] ?? false);
  const activeCount = folder.allLeaves.filter((leaf) =>
    selectedReferences.has(leaf.referenceId),
  ).length;

  const folderState: VisibilityState =
    activeCount === folder.allLeaves.length
      ? "visible"
      : activeCount === 0
        ? "hidden"
        : "partial";

  const folderTooltip =
    folderState === "visible"
      ? t("hideFolderTooltip", { folder: folder.name })
      : folderState === "partial"
        ? t("partialFolderTooltip", {
            active: activeCount,
            total: folder.allLeaves.length,
          })
        : t("showFolderTooltip", { folder: folder.name });

  const toggleFolder = () => {
    const nextChecked = folderState !== "visible";
    onToggleMany(
      folder.allLeaves.map((leaf) => leaf.referenceId),
      nextChecked,
    );
  };

  return (
    <div className="sidebar__tree-branch">
      <div
        className="sidebar__folder"
        style={{ paddingInlineStart: `${String(depth * 14 + 6)}px` }}
      >
        <button
          type="button"
          className="sidebar__folder-toggle"
          aria-expanded={isExpanded}
          disabled={search !== ""}
          onClick={() => {
            onToggleCollapse(folderKey);
          }}
        >
          <span className="sidebar__chevron" aria-hidden="true">
            {isExpanded ? "▾" : "▸"}
          </span>
          <span className="sidebar__folder-name" title={folder.fullPath}>
            {folder.name}
          </span>
        </button>
        <span
          className="sidebar__count"
          aria-label={t("activeCount", {
            active: activeCount,
            total: folder.allLeaves.length,
          })}
        >
          {activeCount}/{folder.allLeaves.length}
        </span>
        <VisibilityEye
          state={folderState}
          label={t("toggleFolder", { folder: folder.fullPath })}
          title={folderTooltip}
          onToggle={toggleFolder}
        />
      </div>
      {isExpanded && (
        <>
          {folder.leaves.length > 0 && (
            <ul className="sidebar__list">
              {folder.leaves.map((leaf) => (
                <RefLeafRow
                  key={`${label}/${leaf.target.name}`}
                  leaf={leaf}
                  depth={depth + 1}
                  label={label}
                  selectedCommitId={selectedCommitId}
                  onOpen={onOpen}
                  onMenu={onMenu}
                  monospace={monospace}
                  selectedReferences={selectedReferences}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          )}
          {folder.folders.map((subfolder) => (
            <RefFolderRow
              key={`${label}:${subfolder.fullPath}`}
              folder={subfolder}
              depth={depth + 1}
              label={label}
              selectedCommitId={selectedCommitId}
              onOpen={onOpen}
              onMenu={onMenu}
              monospace={monospace}
              search={search}
              selectedReferences={selectedReferences}
              collapsedFolders={collapsedFolders}
              onToggleCollapse={onToggleCollapse}
              onToggle={onToggle}
              onToggleMany={onToggleMany}
            />
          ))}
        </>
      )}
    </div>
  );
}

interface RefGroupProps {
  readonly label: string;
  readonly refs: readonly RefTarget[];
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  readonly onMenu?: (x: number, y: number, target: RefTarget) => void;
  readonly monospace?: boolean;
  readonly search: string;
  readonly selectedReferences: ReadonlySet<string>;
  readonly collapsed: boolean;
  readonly onCollapse: () => void;
  readonly collapsedFolders: Readonly<Record<string, boolean>>;
  readonly onToggleCollapse: (key: string) => void;
  readonly onToggle: (referenceId: string, checked: boolean) => void;
  readonly onToggleMany: (
    referenceIds: readonly string[],
    checked: boolean,
  ) => void;
}

/**
 * One labelled list of refs organized as a hierarchical tree.
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
  collapsedFolders,
  onToggleCollapse,
  onToggle,
  onToggleMany,
}: RefGroupProps) {
  const { t } = useTranslation("refs");
  const visible = useMemo(
    () =>
      refs.filter((entry) =>
        entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [refs, search],
  );

  const tree = useMemo(() => buildRefTree(visible), [visible]);

  if (visible.length === 0) return null;

  const selectedCount = visible.filter((entry) =>
    selectedReferences.has(entry.referenceId),
  ).length;

  const sectionCollapsed = collapsed && search === "";

  const groupState: VisibilityState =
    selectedCount === visible.length
      ? "visible"
      : selectedCount === 0
        ? "hidden"
        : "partial";

  const groupTooltip =
    groupState === "visible"
      ? t("hideGroupTooltip", { group: label })
      : groupState === "partial"
        ? t("partialGroupTooltip", {
            active: selectedCount,
            total: visible.length,
          })
        : t("showGroupTooltip", { group: label });

  const toggleGroup = () => {
    const nextChecked = groupState !== "visible";
    onToggleMany(
      visible.map((entry) => entry.referenceId),
      nextChecked,
    );
  };

  return (
    <>
      <div className="sidebar__label">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={!sectionCollapsed}
          disabled={search !== ""}
          onClick={onCollapse}
        >
          <span className="sidebar__chevron" aria-hidden="true">
            {sectionCollapsed ? "▸" : "▾"}
          </span>
          <span>{label}</span>
        </button>
        <span
          className="sidebar__count"
          aria-label={t("activeCount", {
            active: selectedCount,
            total: visible.length,
          })}
        >
          {selectedCount}/{visible.length}
        </span>
        <VisibilityEye
          state={groupState}
          label={t("toggleGroup", { group: label })}
          title={groupTooltip}
          onToggle={toggleGroup}
        />
      </div>
      {!sectionCollapsed && (
        <div className="sidebar__group-content">
          {tree.leaves.length > 0 && (
            <ul className="sidebar__list">
              {tree.leaves.map((leaf) => (
                <RefLeafRow
                  key={`${label}/${leaf.target.name}`}
                  leaf={leaf}
                  depth={0}
                  label={label}
                  selectedCommitId={selectedCommitId}
                  onOpen={onOpen}
                  onMenu={onMenu}
                  monospace={monospace}
                  selectedReferences={selectedReferences}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          )}
          {tree.folders.map((folder) => (
            <RefFolderRow
              key={`${label}:${folder.fullPath}`}
              folder={folder}
              depth={0}
              label={label}
              selectedCommitId={selectedCommitId}
              onOpen={onOpen}
              onMenu={onMenu}
              monospace={monospace}
              search={search}
              selectedReferences={selectedReferences}
              collapsedFolders={collapsedFolders}
              onToggleCollapse={onToggleCollapse}
              onToggle={onToggle}
              onToggleMany={onToggleMany}
            />
          ))}
        </div>
      )}
    </>
  );
}
