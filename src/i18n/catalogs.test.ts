import { describe, expect, it } from "vitest";

import type { AppError } from "../bindings";

import { FALLBACK_LANGUAGE, LANGUAGES, languageDefinition } from "./languages";
import { en } from "./locales/en";

interface Tree {
  readonly [key: string]: string | Tree;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Every leaf of a catalog as `namespace.dotted.path` → text. */
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") leaves.set(path, value);
    else for (const [k, v] of flatten(value, path)) leaves.set(k, v);
  }
  return leaves;
}

function leavesOf(code: string): Map<string, string> {
  const language = LANGUAGES.find((candidate) => candidate.code === code);
  if (language === undefined) throw new Error(`Unregistered language ${code}`);
  return flatten(language.resources);
}

/** The key without its plural suffix, which is what languages must share. */
function baseKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, "");
}

function pluralSuffix(key: string): string | null {
  return PLURAL_SUFFIX.exec(key)?.[1] ?? null;
}

/** Interpolated variable names and rich-text tags a message depends on. */
function placeholders(text: string): { vars: string[]; tags: string[] } {
  const vars = [...text.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1] ?? "");
  const tags = [...text.matchAll(/<\/?(\w+)>/g)].map((m) => m[1] ?? "");
  return { vars: [...new Set(vars)].sort(), tags: [...new Set(tags)].sort() };
}

/** Plural keys grouped by their base key, with the categories each defines. */
function pluralGroups(leaves: Map<string, string>): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  for (const key of leaves.keys()) {
    const suffix = pluralSuffix(key);
    if (suffix === null) continue;
    const base = baseKey(key);
    groups.set(base, (groups.get(base) ?? new Set()).add(suffix));
  }
  return groups;
}

describe("language registry", () => {
  it("lists the base language first", () => {
    expect(LANGUAGES[0].code).toBe(FALLBACK_LANGUAGE);
  });

  it.each(LANGUAGES.map((language) => [language.code, language] as const))(
    "describes %s with a valid tag, a native name and a direction",
    (code, language) => {
      expect(Intl.getCanonicalLocales(code)).toEqual([code]);
      expect(language.nativeName.trim()).not.toBe("");
      expect(["ltr", "rtl"]).toContain(language.dir);
    },
  );

  it("registers each code once", () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("registers exactly the namespaces of the base catalog in every language", () => {
    const namespaces = Object.keys(en).sort();
    for (const language of LANGUAGES) {
      expect(Object.keys(language.resources).sort()).toEqual(namespaces);
    }
  });

  it("resolves a registered code to its definition", () => {
    expect(languageDefinition("es").nativeName).toBe("Español");
  });
});

describe("catalog parity", () => {
  const base = leavesOf(FALLBACK_LANGUAGE);
  const baseKeys = new Set([...base.keys()].map(baseKey));

  describe.each(
    LANGUAGES.filter((language) => language.code !== FALLBACK_LANGUAGE).map(
      (language) => language.code,
    ),
  )("%s", (code) => {
    const leaves = leavesOf(code);

    it("has every key of the base catalog and no others", () => {
      const keys = new Set([...leaves.keys()].map(baseKey));
      expect([...keys].sort()).toEqual([...baseKeys].sort());
    });

    it("has no empty message", () => {
      for (const [key, text] of leaves) {
        expect(text.trim(), key).not.toBe("");
      }
    });

    it("interpolates the same variables and tags as the base message", () => {
      const baseByKey = new Map<string, string>();
      for (const [key, text] of base) baseByKey.set(baseKey(key), text);

      for (const [key, text] of leaves) {
        const reference = baseByKey.get(baseKey(key));
        if (reference === undefined) continue;
        const expected = placeholders(reference);
        const actual = placeholders(text);
        // A plural form may drop `count` when the number is implied (`one`).
        const vars =
          pluralSuffix(key) === null
            ? actual.vars
            : actual.vars.filter((name) => name !== "count");
        const wanted =
          pluralSuffix(key) === null
            ? expected.vars
            : expected.vars.filter((name) => name !== "count");
        expect(vars, key).toEqual(wanted);
        expect(actual.tags, key).toEqual(expected.tags);
      }
    });
  });

  describe.each(LANGUAGES.map((language) => language.code))(
    "%s plural forms",
    (code) => {
      it("defines every category the language's plural rules use", () => {
        // A superset is fine: an older ICU knows fewer categories than the CLDR
        // the catalog was written for, and a form it never selects is harmless.
        const required = new Intl.PluralRules(code).resolvedOptions()
          .pluralCategories;
        for (const [base, defined] of pluralGroups(leavesOf(code))) {
          for (const category of required) {
            expect(defined.has(category), `${base}_${category}`).toBe(true);
          }
        }
      });
    },
  );

  it("keeps the same plural keys in every language", () => {
    const reference = [...pluralGroups(base).keys()].sort();
    for (const language of LANGUAGES) {
      expect(
        [...pluralGroups(leavesOf(language.code)).keys()].sort(),
        language.code,
      ).toEqual(reference);
    }
  });
});

describe("backend error summaries", () => {
  // Every kind the backend can send; the type forces this list to stay whole.
  const kinds: Record<AppError["kind"], true> = {
    InvalidRepository: true,
    Io: true,
    Git: true,
    Auth: true,
    Network: true,
    Conflict: true,
    InvalidInput: true,
    PathOutsideRepository: true,
    WorktreeChanged: true,
    WorktreeFileUnavailable: true,
    ResourceLimitExceeded: true,
    WatchDegraded: true,
    StaleCursor: true,
    ResourceExhausted: true,
    Internal: true,
  };

  it.each(LANGUAGES.map((language) => language.code))(
    "has a summary for every kind in %s",
    (code) => {
      const leaves = leavesOf(code);
      for (const kind of Object.keys(kinds)) {
        expect(leaves.has(`errors.kind.${kind}`), kind).toBe(true);
      }
    },
  );
});
