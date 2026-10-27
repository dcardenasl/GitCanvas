import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { formatCommitTime } from "../CommitTable/format";
import type { RefTarget } from "./refTypes";
import { buildRefTree, type RefFolderNode, type RefLeafNode } from "./refTree";
import { VisibilityEye, type VisibilityState } from "./VisibilityEye";

interface RefLeafRowProps {
  readonly leaf: RefLeafNode;
  readonly depth: number;
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
          <span
            className="sidebar__badge sidebar__badge--worktree"
            title={t("worktrees.openElsewhereTooltip", {
              root: entry.occupiedWorktree.root,
            })}
          >
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
      {onMenu !== undefined ? (
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
      ) : (
        <span className="sidebar__actions-spacer" aria-hidden="true" />
      )}
    </li>
  );
}

interface RefFolderRowProps {
  readonly folder: RefFolderNode;
  readonly depth: number;
  readonly groupId: "local" | "remote" | "tags";
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  readonly onMenu?:
    ((x: number, y: number, target: RefTarget) => void) | undefined;
  readonly monospace?: boolean | undefined;
  readonly search: string;
  readonly selectedReferences: ReadonlySet<string>;
  readonly collapsedFolders: ReadonlySet<string>;
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
  groupId,
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
  const folderKey = `folder:${groupId}:${folder.fullPath}`;
  const isExpanded = search !== "" || !collapsedFolders.has(folderKey);
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
        <span className="sidebar__actions-spacer" aria-hidden="true" />
      </div>
      {isExpanded && (
        <>
          {folder.leaves.length > 0 && (
            <ul className="sidebar__list">
              {folder.leaves.map((leaf) => (
                <RefLeafRow
                  key={`${groupId}/${leaf.target.name}`}
                  leaf={leaf}
                  depth={depth + 1}
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
              key={`folder:${groupId}:${subfolder.fullPath}`}
              folder={subfolder}
              depth={depth + 1}
              groupId={groupId}
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
  readonly groupId: "local" | "remote" | "tags";
  readonly refs: readonly RefTarget[];
  readonly selectedCommitId: string | null;
  readonly onOpen: (commitId: string) => void;
  readonly onMenu?: (x: number, y: number, target: RefTarget) => void;
  readonly monospace?: boolean;
  readonly search: string;
  readonly selectedReferences: ReadonlySet<string>;
  readonly collapsed: boolean;
  readonly onCollapse: () => void;
  readonly collapsedFolders: ReadonlySet<string>;
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
export function RefGroup({
  label,
  groupId,
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
        <span className="sidebar__actions-spacer" aria-hidden="true" />
      </div>
      {!sectionCollapsed && (
        <div className="sidebar__group-content">
          {tree.leaves.length > 0 && (
            <ul className="sidebar__list">
              {tree.leaves.map((leaf) => (
                <RefLeafRow
                  key={`${groupId}/${leaf.target.name}`}
                  leaf={leaf}
                  depth={0}
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
              key={`folder:${groupId}:${folder.fullPath}`}
              folder={folder}
              depth={0}
              groupId={groupId}
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
