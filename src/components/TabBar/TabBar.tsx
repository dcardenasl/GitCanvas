import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import type { OpenFolder } from "../AppShell/useOpenFolder";
import { copyText } from "../../lib/clipboard";
import { shortcutLabel } from "../../lib/platform";
import { closeOtherTabs, closeTabsAfter } from "../../state/tabCommands";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { FavoriteToggle } from "../FavoriteToggle/FavoriteToggle";
import { ErrorMessage } from "../ErrorMessage";
import { useWorkspace, type Tab } from "../../state/workspace";
import { labelTabs } from "./tabLabels";

import "./TabBar.css";

/** An open menu and the point it opened at. */
type OpenMenu =
  /** Under the control that opened it: the open menu or the list of all tabs. */
  | { readonly kind: "new" | "all"; readonly x: number; readonly y: number }
  /** At the pointer, for one tab. */
  | {
      readonly kind: "tab";
      readonly root: string;
      readonly x: number;
      readonly y: number;
    };

/** Opens `kind` under the control that was clicked. */
function openUnder(kind: "new" | "all", control: HTMLElement): OpenMenu {
  const { left, bottom } = control.getBoundingClientRect();
  return { kind, x: left, y: bottom };
}

/** How far a pointer must travel before a press on a tab becomes a drag. */
const DRAG_THRESHOLD = 5;

/** A press on a tab that may turn into a drag. */
interface Press {
  readonly root: string;
  readonly pointerId: number;
  readonly startX: number;
  dragging: boolean;
}

/** The horizontal middle of an element on screen. */
function centerOf(element: Element): number {
  const { left, width } = element.getBoundingClientRect();
  return left + width / 2;
}

/**
 * The tab a dragged tab should swap places with, if the pointer has gone past
 * the middle of a neighbor.
 *
 * Crossing the neighbor's middle, not entering it, is what makes a swap stable:
 * once swapped, the pointer is on the near side of that middle, so tabs of
 * different widths cannot trade places back and forth under a still pointer.
 * It reads the screen position, so it holds for a right-to-left row too.
 */
function swapTarget(
  elements: readonly Element[],
  from: number,
  pointerX: number,
): number | null {
  const dragged = elements[from];
  if (dragged === undefined) return null;
  const own = centerOf(dragged);
  for (const neighbor of [from - 1, from + 1]) {
    const element = elements[neighbor];
    if (element === undefined) continue;
    const middle = centerOf(element);
    if (
      (middle > own && pointerX > middle) ||
      (middle < own && pointerX < middle)
    ) {
      return neighbor;
    }
  }
  return null;
}

/** The mark a tab carries when its project needs attention, if any. */
function statusOf(tab: Tab): "writing" | "unreachable" | null {
  if (tab.gitActions.running !== null) return "writing";
  return tab.verification.status === "unreachable" ? "unreachable" : null;
}

/**
 * The open projects as tabs, and the way to open another.
 *
 * Each tab says only what is true of it without being asked: whether it is
 * being written to and whether its folder could not be checked. Anything that
 * could be out of date in a tab nobody is looking at — its branch, whether it
 * has changes — is not shown.
 */
export function TabBar({
  folder,
  repositoryRoots = new Set<string>(),
  repositoryId = null,
}: {
  readonly folder: OpenFolder;
  readonly repositoryRoots?: ReadonlySet<string>;
  readonly repositoryId?: string | null;
}) {
  const { t } = useTranslation("shell");
  const tabs = useWorkspace(useShallow((state) => state.tabs));
  const activeRoot = useWorkspace((state) => state.activeRoot);
  const activate = useWorkspace((state) => state.activate);
  const closeTab = useWorkspace((state) => state.closeTab);
  const moveTab = useWorkspace((state) => state.moveTab);
  const closedTabs = useWorkspace((state) => state.closedTabs);
  const notify = useWorkspace((state) => state.notify);
  const reopenClosedTab = useWorkspace((state) => state.reopenClosedTab);
  const favorites = useWorkspace((state) => state.favorites);
  const homeOpen = useWorkspace((state) => state.homeOpen);
  const setHomeOpen = useWorkspace((state) => state.setHomeOpen);
  const setGitHubOpen = useWorkspace((state) => state.setGitHubOpen);

  const labels = labelTabs(tabs.map((tab) => tab.repository));
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const tablist = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  // A drag ends with a click on the dragged tab, which must not also select it.
  const dragEndedOnTab = useRef(false);

  // Home is selected whenever it is asked for, and when there is no project to
  // be selected instead.
  const atHome = homeOpen || tabs.length === 0;

  /** Every tab in the row, Home first: what the arrow keys walk. */
  const rowElements = (): HTMLElement[] =>
    Array.from(
      tablist.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );

  /** The project tabs only, in the order of `tabs`: what a drag reorders. */
  const tabElements = (): HTMLElement[] =>
    rowElements().filter((element) => element.dataset.home === undefined);

  const focusActiveTab = () => {
    requestAnimationFrame(() => {
      tablist.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const elements = rowElements();
    const current = elements.findIndex((element) =>
      element.contains(event.target as Node),
    );
    if (current < 0) return;
    // Home is the first of the row; the project tabs follow it, in order.
    const tab = tabs[current - 1];
    // Left and Right follow the reading direction of the language.
    const rtl = document.documentElement.dir === "rtl";
    const toward = (direction: 1 | -1) => (rtl ? -direction : direction);

    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        const step = toward(event.key === "ArrowRight" ? 1 : -1);
        event.preventDefault();
        if (event.altKey) {
          // Home stays first, and nothing can be moved before it.
          if (tab !== undefined) {
            moveTab(tab.repository.path, current - 1 + step);
          }
        } else {
          elements[
            (current + step + elements.length) % elements.length
          ]?.focus();
        }
        break;
      }
      case "Home":
        event.preventDefault();
        elements[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        elements.at(-1)?.focus();
        break;
      case "Delete":
        event.preventDefault();
        if (tab !== undefined && closeTab(tab.repository.path) === "closed")
          focusActiveTab();
        break;
    }
  };

  const onPointerDown = (root: string, event: PointerEvent<HTMLElement>) => {
    dragEndedOnTab.current = false;
    if (event.button !== 0) return;
    press.current = {
      root,
      pointerId: event.pointerId,
      startX: event.clientX,
      dragging: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    if (!current.dragging) {
      if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD) return;
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const elements = tabElements();
    const from = tabs.findIndex((tab) => tab.repository.path === current.root);
    const to = swapTarget(elements, from, event.clientX);
    if (to !== null) moveTab(current.root, to);
  };

  const endPress = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    press.current = null;
    if (current.dragging) {
      dragEndedOnTab.current = true;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const currentTab = atHome
    ? undefined
    : tabs.find((tab) => tab.repository.path === activeRoot);
  const newItems: readonly MenuItem[] = [
    {
      label: t("tabs.menu.openFolder"),
      onSelect: folder.choose,
      shortcut: shortcutLabel("O"),
    },
    {
      label: t("tabs.menu.cloneGitHub"),
      onSelect: () => {
        setGitHubOpen(true);
      },
    },
    // Offered only when there is something to reopen, so it is never a dead end.
    ...(closedTabs.length === 0
      ? []
      : [
          {
            label: t("tabs.menu.reopen"),
            shortcut: shortcutLabel("T", true),
            onSelect: () => {
              reopenClosedTab();
            },
          },
        ]),
    ...(currentTab === undefined
      ? []
      : [
          {
            startsGroup: true,
            label: t(
              favorites.includes(currentTab.repository.path)
                ? "workspace.unfavorite"
                : "workspace.favorite",
              { name: currentTab.repository.name },
            ),
            onSelect: () => {
              useWorkspace
                .getState()
                .toggleFavorite(currentTab.repository.path);
            },
          },
        ]),
  ];
  const tabItems = (root: string): readonly MenuItem[] => {
    const index = tabs.findIndex((tab) => tab.repository.path === root);
    const others = tabs.length > 1;
    const after = index >= 0 && index < tabs.length - 1;
    return [
      {
        label: t("tabs.context.close"),
        onSelect: () => {
          closeTab(root);
        },
      },
      // Offered only when they would do something, so none is a dead end.
      ...(others
        ? [
            {
              label: t("tabs.context.closeOthers"),
              onSelect: () => {
                closeOtherTabs(root);
              },
            },
          ]
        : []),
      ...(after
        ? [
            {
              label: t("tabs.context.closeAfter"),
              onSelect: () => {
                closeTabsAfter(root);
              },
            },
          ]
        : []),
      {
        label: t("tabs.context.copyPath"),
        startsGroup: true,
        onSelect: () => {
          void copyText(root).then((copied) => {
            if (!copied) notify({ code: "pathCopyFailed", path: root });
          });
        },
      },
    ];
  };
  const allItems: readonly MenuItem[] = tabs.map((tab, index) => ({
    label: labels[index]?.text ?? tab.repository.path,
    onSelect: () => {
      activate(tab.repository.path);
    },
  }));

  return (
    <div className="tab-bar">
      <div
        ref={tablist}
        className="tab-bar__tabs"
        role="tablist"
        aria-label={t("tabs.label")}
        onKeyDown={onKeyDown}
      >
        <div
          className={
            atHome
              ? "tab-bar__tab tab-bar__tab--home tab-bar__tab--active"
              : "tab-bar__tab tab-bar__tab--home"
          }
        >
          <button
            type="button"
            role="tab"
            data-home=""
            className="tab-bar__select"
            aria-selected={atHome}
            tabIndex={atHome ? 0 : -1}
            onClick={() => {
              setHomeOpen(true);
            }}
          >
            <svg
              className="tab-bar__home-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m3.5 11 8.5-7 8.5 7M6 9.5V20h4v-5h4v5h4V9.5" />
            </svg>
            <span className="tab-bar__name">{t("tabs.home")}</span>
          </button>
        </div>
        {tabs.map((tab, index) => {
          const root = tab.repository.path;
          const active = !atHome && root === activeRoot;
          const label = labels[index];
          const status = statusOf(tab);
          const busy = tab.gitActions.running !== null;
          const name = label?.text ?? tab.repository.name;
          const inActiveRepository = repositoryRoots.has(root);
          const previousInGroup =
            index > 0 &&
            repositoryRoots.has(tabs[index - 1]?.repository.path ?? "");
          const nextInGroup =
            index + 1 < tabs.length &&
            repositoryRoots.has(tabs[index + 1]?.repository.path ?? "");
          const tabClass = [
            active ? "tab-bar__tab tab-bar__tab--active" : "tab-bar__tab",
            inActiveRepository && (previousInGroup || nextInGroup)
              ? "tab-bar__tab--repository-group"
              : "",
            inActiveRepository && !previousInGroup && nextInGroup
              ? "tab-bar__tab--repository-group-start"
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={root}
              className={tabClass}
              data-repository-group={
                inActiveRepository && (previousInGroup || nextInGroup)
                  ? (repositoryId ?? "linked")
                  : undefined
              }
              onContextMenu={(event) => {
                // Also what the menu key and Shift+F10 raise on a focused tab.
                event.preventDefault();
                setMenu({
                  kind: "tab",
                  root,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
            >
              {inActiveRepository && !previousInGroup && nextInGroup && (
                <span
                  className="tab-bar__group-indicator"
                  title={t("tabs.sameRepository")}
                  aria-label={t("tabs.sameRepository")}
                >
                  ↔
                </span>
              )}
              <button
                type="button"
                role="tab"
                className="tab-bar__select"
                aria-selected={active}
                aria-busy={busy}
                tabIndex={active ? 0 : -1}
                title={label?.title ?? root}
                onPointerDown={(event) => {
                  onPointerDown(root, event);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onClick={() => {
                  if (dragEndedOnTab.current) {
                    dragEndedOnTab.current = false;
                    return;
                  }
                  activate(root);
                }}
              >
                <span className="tab-bar__name">{name}</span>
                {status !== null && (
                  <span
                    className={`tab-bar__status tab-bar__status--${status}`}
                    title={t(`tabs.${status}`)}
                    role="img"
                    aria-label={t(`tabs.${status}`)}
                  />
                )}
              </button>
              <FavoriteToggle path={root} name={name} compact />
              <button
                type="button"
                className="tab-bar__close"
                // Closing from the keyboard is Delete on the tab, so the row
                // stays one stop in the tab order instead of two per tab.
                tabIndex={-1}
                aria-label={t("tabs.close", { name })}
                title={busy ? t("tabs.closeBusy", { name }) : undefined}
                disabled={busy}
                onClick={() => {
                  closeTab(root);
                }}
              />
            </div>
          );
        })}
      </div>
      {tabs.length > 1 && (
        <button
          type="button"
          className="tab-bar__control tab-bar__all"
          aria-label={t("tabs.all")}
          title={t("tabs.all")}
          aria-haspopup="menu"
          aria-expanded={menu?.kind === "all"}
          onClick={(event) => {
            setMenu(openUnder("all", event.currentTarget));
          }}
        />
      )}
      <button
        type="button"
        className="tab-bar__control tab-bar__new"
        aria-label={t("tabs.new")}
        title={t("tabs.new")}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === "new"}
        disabled={folder.phase !== "idle"}
        onClick={(event) => {
          setMenu(openUnder("new", event.currentTarget));
        }}
      />
      {folder.error !== null && (
        <div role="alert" className="tab-bar__error">
          <ErrorMessage error={folder.error.cause} />
          <button
            type="button"
            className="button"
            onClick={folder.dismissError}
          >
            {t("workspace.dismiss")}
          </button>
        </div>
      )}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.kind === "tab"
              ? tabItems(menu.root)
              : menu.kind === "all"
                ? allItems
                : newItems
          }
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
