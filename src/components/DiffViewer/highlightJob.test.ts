import { describe, expect, it } from "vitest";

import { answerHighlightRequest, runHighlightJob } from "./highlightJob";

describe("runHighlightJob", () => {
  it("returns one row per source line, including blank ones", () => {
    const rows = runHighlightJob({
      mode: "source",
      language: "typescript",
      lines: ["const a = 1;", "", "const b = 2;"],
    });

    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([]);
    expect(rows[0]?.some((s) => s.categories.includes("keyword"))).toBe(true);
  });

  it("returns one entry per patch row, null where there is no code", () => {
    const rows = runHighlightJob({
      mode: "diff",
      language: "typescript",
      lines: [
        { kind: "meta", text: "@@ -1 +1 @@" },
        { kind: "add", text: "const a = 1;" },
      ],
    });

    expect(rows[0]).toBeNull();
    expect(rows[1]?.length).toBeGreaterThan(0);
  });
});

describe("answerHighlightRequest", () => {
  it("echoes the request id with the rows", () => {
    const response = answerHighlightRequest({
      id: 7,
      job: { mode: "source", language: "json", lines: ['{"a": 1}'] },
    });

    expect(response).toMatchObject({ id: 7 });
    expect("rows" in response).toBe(true);
  });

  it("reports a failure as an error message instead of throwing", () => {
    const response = answerHighlightRequest({
      id: 8,
      // A language outside the registry reaches the tokenizer only through a
      // protocol violation; the worker must still answer.
      job: { mode: "source", language: "nope" as never, lines: ["x"] },
    });

    expect(response.id).toBe(8);
    expect("error" in response).toBe(true);
  });
});
