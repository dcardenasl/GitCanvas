import { describe, expect, it } from "vitest";

import { readStylesheet } from "../../test/stylesheets";

const css = readStylesheet("components/CommitTable/CommitTable.css");

/** The body of the first at-rule whose prelude starts with `prelude`. */
function atRule(prelude: string): string {
  const start = css.indexOf(prelude);
  if (start < 0) throw new Error(`missing ${prelude}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
    }
  }
  throw new Error(`unterminated ${prelude}`);
}

describe("the history table's responsive columns", () => {
  it("answers to its own width, not the window's", () => {
    expect(css).toMatch(
      /\.commit-table \{[^}]*container: commits \/ inline-size/s,
    );
    expect(css).not.toMatch(/@media[^{]*width/);
  });

  it("gives up the hash first, then the author's name, then the date", () => {
    const hash = atRule("@container commits (max-width: 760px)");
    const author = atRule("@container commits (max-width: 600px)");
    const date = atRule("@container commits (max-width: 460px)");

    expect(hash).toContain(".commit-row__sha");
    expect(author).toContain(".commit-row__author-name");
    expect(date).toContain(".commit-row__date");
    // Widths shrink as more is given up.
    expect(760).toBeGreaterThan(600);
    expect(600).toBeGreaterThan(460);
  });

  it("restates the track list whenever a column is hidden, so no empty track keeps its gap", () => {
    expect(atRule("@container commits (max-width: 760px)")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto auto;",
    );
    expect(atRule("@container commits (max-width: 460px)")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;",
    );
  });

  it("keeps a readable summary and fits references without crushing badges", () => {
    expect(css).toMatch(/\.commit-row__summary \{[^}]*min-width: 12ch/s);
    expect(css).toMatch(/\.ref-pill \{[^}]*flex-shrink: 0/s);
  });

  it("keeps the colour dot fixed-size and truncates only the label", () => {
    expect(css).toMatch(/\.ref-pill__color \{[^}]*flex: 0 0 6px/s);
    expect(css).not.toMatch(/\.ref-pill__color \{[^}]*margin-inline-end/s);
    expect(css).toMatch(/\.ref-pill__label \{[^}]*text-overflow: ellipsis/s);
    expect(css).toMatch(/\.commit-refs \{[^}]*flex: none/s);
  });
});
