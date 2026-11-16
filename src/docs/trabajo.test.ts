import { describe, expect, it } from "vitest";

/**
 * Guards `docs/protocolo-trabajo.md`: the execution documents (TASKS, ARCHIVES,
 * plans, ADRs and verification records) follow the protocol from the version
 * that introduced each rule, and history is never rewritten to fit it.
 */
const first = (files: Record<string, string>): string =>
  Object.values(files)[0] ?? "";

const ROADMAP = first(
  import.meta.glob<string>("../../ROADMAP.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
const TASKS = first(
  import.meta.glob<string>("../../TASKS.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
const ARCHIVES = first(
  import.meta.glob<string>("../../ARCHIVES.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
const ADRS = import.meta.glob<string>("../../docs/adr/0*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const PLANS = import.meta.glob<string>("../../docs/plan/*-v0.*-implementacion.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const VERIFICATIONS = import.meta.glob<string>("../../docs/verification/v0.*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** First version whose documents must follow the template rules. */
const FIRST_TEMPLATED_MINOR = 8;

const publishedMinors = [
  ...ROADMAP.matchAll(/^\| v0\.(\d+) \| [^|]+ \| Publicada v0\.\d+\.0 \|/gm),
].map((match) => Number(match[1]));

const minorOf = (path: string): number =>
  Number(/v0\.(\d+)/.exec(path.split("/").pop() ?? "")?.[1] ?? "-1");

/** GitHub's heading slug, so index links can be checked against headings. */
const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");

const headings = (markdown: string): { level: number; title: string }[] => {
  let inCode = false;
  const found: { level: number; title: string }[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) inCode = !inCode;
    const match = !inCode ? /^(#{2,3}) (.*)$/.exec(line) : null;
    if (match) found.push({ level: (match[1] ?? "").length, title: match[2] ?? "" });
  }
  return found;
};

describe("TASKS.md", () => {
  it("keeps no queue for a published version", () => {
    const queues = [...TASKS.matchAll(/^### v0\.(\d+) —/gm)].map((match) =>
      Number(match[1]),
    );
    expect(queues.filter((minor) => publishedMinors.includes(minor))).toEqual([]);
  });

  it("never repeats a task id", () => {
    const ids = [...TASKS.matchAll(/^\s*- \[[ x]\] \*\*([A-Z0-9-]+) —/gm)].map(
      (match) => match[1],
    );
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
});

describe("ARCHIVES.md", () => {
  it("archives every published version from v0.8 on", () => {
    const missing = publishedMinors
      .filter((minor) => minor >= FIRST_TEMPLATED_MINOR)
      .filter(
        (minor) =>
          !new RegExp(
            `^### v0\\.${String(minor)} — .*publicada como v0\\.${String(minor)}\\.0\\)`,
            "m",
          ).test(ARCHIVES),
      );
    expect(missing).toEqual([]);
  });

  it("has an index whose links all reach a heading", () => {
    const slugs = new Set(headings(ARCHIVES).map((heading) => slug(heading.title)));
    const links = [...ARCHIVES.matchAll(/^\s*- \[[^\]]+\]\(#([^)]+)\)$/gm)].map(
      (match) => match[1] ?? "",
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((link) => !slugs.has(link))).toEqual([]);
  });

  it("indexes every section and every version heading", () => {
    const index = ARCHIVES.split("## Índice")[1]?.split("\n## ")[0] ?? "";
    const missing = headings(ARCHIVES)
      .filter(
        (heading) =>
          heading.title !== "Índice" &&
          (heading.level === 2 || /^v0\.\d+ —/.test(heading.title)),
      )
      .filter((heading) => !index.includes(`](#${slug(heading.title)}`));
    expect(missing.map((heading) => heading.title)).toEqual([]);
  });
});

describe("ADRs", () => {
  it("have at least one", () => {
    expect(Object.keys(ADRS).length).toBeGreaterThan(0);
  });

  it("state their status with an allowed word", () => {
    const bad = Object.entries(ADRS)
      .filter(([, body]) => {
        const status = /^## (?:Status|Estado)\n+([^\n]+)/m.exec(body)?.[1] ?? "";
        return !/^(Proposed|Accepted|Superseded|Propuesto|Aceptado|Reemplazado)/.test(
          status,
        );
      })
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });
});

describe("version plans", () => {
  const required = [
    "## Origen y alcance vigente",
    "## Contexto observado en el código",
    "## Decisiones",
    "## Contrato técnico",
    "## Matriz de aceptación",
    "## Tareas y dependencias",
    "## Riesgos y criterios de cierre",
  ];

  it("carry the template sections from v0.8 on", () => {
    const missing = Object.entries(PLANS)
      .filter(([path]) => minorOf(path) >= FIRST_TEMPLATED_MINOR)
      .flatMap(([path, body]) =>
        required
          .filter((section) => !body.includes(`\n${section}`))
          .map((section) => `${path}: ${section}`),
      );
    expect(missing).toEqual([]);
  });
});

describe("verification records", () => {
  const required = ["## Suites", "## Límites y gates pendientes"];

  it("carry the template sections from v0.8 on", () => {
    const missing = Object.entries(VERIFICATIONS)
      .filter(([path]) => minorOf(path) >= FIRST_TEMPLATED_MINOR)
      .flatMap(([path, body]) =>
        required
          .filter((section) => !body.includes(`\n${section}`))
          .map((section) => `${path}: ${section}`),
      );
    expect(missing).toEqual([]);
  });
});
