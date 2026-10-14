import { describe, expect, it } from "vitest";

import { readStylesheet } from "../test/stylesheets";

/**
 * Components written for several languages use logical properties, so a
 * right-to-left language mirrors them without a second stylesheet.
 */
const LOGICAL_ONLY = [
  "components/ErrorMessage/ErrorMessage.css",
  "components/LanguageSelector/LanguageSelector.css",
  "components/PreferencesMenu/PreferencesMenu.css",
  "components/TabBar/TabBar.css",
  "components/ContextMenu/ContextMenu.css",
  "components/WorkspaceGate/WorkspaceGate.css",
  "components/ProjectLibrary/ProjectLibrary.css",
  "components/FavoriteToggle/FavoriteToggle.css",
];

const PHYSICAL =
  /(?<![\w-])(?:margin|padding|border)-(?:left|right)\b|(?<![\w-])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)\b/;

describe("stylesheets of the internationalized components", () => {
  it.each(LOGICAL_ONLY)("%s uses logical properties only", (file) => {
    const offending = readStylesheet(file)
      .split("\n")
      .filter((line) => PHYSICAL.test(line))
      .map((line) => line.trim());
    expect(offending).toEqual([]);
  });

  it("flags a physical property when one is written", () => {
    expect(PHYSICAL.test("  margin-left: 4px;")).toBe(true);
    expect(PHYSICAL.test("  margin-inline-start: 4px;")).toBe(false);
  });
});
