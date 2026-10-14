import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { useOpenFolder } from "../AppShell/useOpenFolder";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { ErrorMessage } from "../ErrorMessage";
import { useWorkspace, type Tab } from "../../state/workspace";
import { labelTabs } from "./tabLabels";

import "./TabBar.css";

/** An open menu and the point just under the control that opened it. */
interface OpenMenu {
  readonly kind: "new" | "all";
  readonly x: number;
  readonly y: number;
}

/** Opens `kind` under the control that was clicked. */
function openUnder(kind: OpenMenu["kind"], control: HTMLElement): OpenMenu {
  const { left, bottom } = control.getBoundingClientRect();
  return { kind, x: left, y: bottom };
}

/** The mark a tab carries when its project needs attention, if any. */
function statusOf(tab: Tab): "writing" | "unverified" | "unreachable" | null {
  if (tab.gitActions.running !== null) return "writing";
  switch (tab.verification.status) {
    case "unverified":
      return "unverified";
    case "unreachable":
      return "unreachable";
    case "verifying":
    case "verified":
      return null;
  }
}

/**
 * The open projects as tabs, and the way to open another.
 *
 * Each tab says only what is true of it without being asked: whether it is
 * being written to and whether its folder could not be checked. Anything that
 * could be out of date in a tab nobody is looking at — its branch, whether it
 * has changes — is not shown.
 */
export function TabBar() {
  const { t } = useTranslation("shell");
  const tabs = useWorkspace(useShallow((state) => state.tabs));
  const activeRoot = useWorkspace((state) => state.activeRoot);
  const activate = useWorkspace((state) => state.activate);
  const closeTab = useWorkspace((state) => state.closeTab);
  const setGitHubOpen = useWorkspace((state) => state.setGitHubOpen);
  const folder = useOpenFolder();

  const labels = labelTabs(tabs.map((tab) => tab.repository));
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  const newItems: readonly MenuItem[] = [
    { label: t("tabs.menu.openFolder"), onSelect: folder.choose },
    {
      label: t("tabs.menu.cloneGitHub"),
      onSelect: () => {
        setGitHubOpen(true);
      },
    },
  ];
  const allItems: readonly MenuItem[] = tabs.map((tab, index) => ({
    label: labels[index]?.text ?? tab.repository.path,
    onSelect: () => {
      activate(tab.repository.path);
    },
  }));

  return (
    <div className="tab-bar">
      <div
        className="tab-bar__tabs"
        role="tablist"
        aria-label={t("tabs.label")}
      >
        {tabs.map((tab, index) => {
          const root = tab.repository.path;
          const active = root === activeRoot;
          const label = labels[index];
          const status = statusOf(tab);
          const busy = tab.gitActions.running !== null;
          const name = label?.text ?? tab.repository.name;
          return (
            <div
              key={root}
              className={
                active ? "tab-bar__tab tab-bar__tab--active" : "tab-bar__tab"
              }
            >
              <button
                type="button"
                role="tab"
                className="tab-bar__select"
                aria-selected={active}
                aria-busy={busy}
                tabIndex={active ? 0 : -1}
                title={label?.title ?? root}
                onClick={() => {
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
              <button
                type="button"
                className="tab-bar__close"
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
          items={menu.kind === "all" ? allItems : newItems}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
