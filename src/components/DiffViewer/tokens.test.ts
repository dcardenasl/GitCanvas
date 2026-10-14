import { describe, expect, it } from "vitest";

import { readStylesheet } from "../../test/stylesheets";
import { SYNTAX_CATEGORIES } from "./tokens";

const appStyles = readStylesheet("App.css");
const viewerStyles = readStylesheet("components/DiffViewer/DiffViewer.css");

/** How many times `needle` appears in `source`. */
function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("syntax categories", () => {
  it.each(SYNTAX_CATEGORIES)("%s has a viewer rule", (category) => {
    expect(occurrences(viewerStyles, `.syntax-token--${category} {`)).toBe(1);
  });

  it.each(SYNTAX_CATEGORIES)("%s has a color in both themes", (category) => {
    expect(occurrences(appStyles, `--syntax-${category}:`)).toBe(2);
  });

  it("has no viewer rule for a category the highlighter cannot emit", () => {
    const declared = [...viewerStyles.matchAll(/\.syntax-token--([a-z]+) \{/g)];
    expect(declared.map((match) => match[1]).sort()).toEqual(
      [...SYNTAX_CATEGORIES].sort(),
    );
  });
});
