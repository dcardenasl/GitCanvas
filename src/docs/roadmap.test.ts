import { describe, expect, it } from "vitest";

/**
 * Guards `docs/protocolo-roadmap.md`: the version table is the single source of
 * order, so it may not repeat or skip a version, and nothing planned may sit
 * before something already published.
 */
const ROADMAP = import.meta.glob<string>(
  "../../ROADMAP.md",
  { query: "?raw", import: "default", eager: true },
)["../../ROADMAP.md"];

interface Row {
  minor: number;
  status: string;
}

const rows = (text: string): Row[] => {
  const section = text.split("## Secuencia acordada")[1]?.split("\n## ")[0] ?? "";
  return [...section.matchAll(/^\| v0\.(\d+) \| [^|]+ \| ([^|]+) \|/gm)].map(
    (match) => ({ minor: Number(match[1]), status: (match[2] ?? "").trim() }),
  );
};

describe("roadmap version table", () => {
  const table = rows(ROADMAP ?? "");

  it("has rows", () => {
    expect(table.length).toBeGreaterThan(0);
  });

  it("lists consecutive versions without repeats", () => {
    const first = table[0]?.minor ?? 0;
    expect(table.map((row) => row.minor)).toEqual(
      table.map((_, index) => first + index),
    );
  });

  it("uses only the two allowed states", () => {
    for (const row of table) {
      expect(row.status).toMatch(/^(Planificada|Publicada v0\.\d+\.0)$/);
    }
  });

  it("never plans something before a published version", () => {
    const firstPlanned = table.findIndex((row) => row.status === "Planificada");
    const publishedAfter = table
      .slice(Math.max(firstPlanned, 0))
      .some((row) => row.status.startsWith("Publicada"));
    expect(firstPlanned === -1 || !publishedAfter).toBe(true);
  });

  it("publishes each row under its own minor version", () => {
    for (const row of table) {
      if (row.status.startsWith("Publicada")) {
        expect(row.status).toBe(`Publicada v0.${String(row.minor)}.0`);
      }
    }
  });
});
