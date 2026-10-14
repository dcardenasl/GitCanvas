import { useEffect } from "react";

import { isMacPlatform } from "../../lib/platform";
import {
  activatePosition,
  activateRelative,
  closeActiveTab,
} from "../../state/tabCommands";
import { isTextEntry, tabShortcut } from "./shortcuts";

/**
 * The keyboard shortcuts for the row of tabs, for the whole window.
 *
 * Attached to the window rather than to the tab bar: they must work wherever
 * focus is, including on the start screen where Open is what they are for. A
 * chord is ignored inside a dialog, which owns the keyboard while it is up.
 *
 * @param openFolder - Asks for a folder to open as a project.
 */
export function useTabShortcuts(openFolder: () => void): void {
  useEffect(() => {
    const mac = isMacPlatform();
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const { target } = event;
      if (target instanceof Element && target.closest("dialog") !== null) {
        return;
      }
      const shortcut = tabShortcut(event, mac, isTextEntry(target));
      if (shortcut === null) return;

      event.preventDefault();
      switch (shortcut.kind) {
        case "next":
          activateRelative(1);
          break;
        case "previous":
          activateRelative(-1);
          break;
        case "position":
          activatePosition(shortcut.position);
          break;
        case "open":
          openFolder();
          break;
        case "close":
          closeActiveTab();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openFolder]);
}
