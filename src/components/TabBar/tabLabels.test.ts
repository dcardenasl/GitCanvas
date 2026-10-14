import { describe, expect, it } from "vitest";

import { labelTabs } from "./tabLabels";

const repo = (path: string, name = path.split(/[\\/]/).at(-1) ?? path) => ({
  path,
  name,
});

describe("labelTabs", () => {
  it("shows a unique name on its own, with the full path as the tooltip", () => {
    expect(labelTabs([repo("/work/alpha"), repo("/work/beta")])).toEqual([
      { text: "alpha", title: "/work/alpha" },
      { text: "beta", title: "/work/beta" },
    ]);
  });

  it("adds the containing folder only to the projects that share a name", () => {
    const labels = labelTabs([
      repo("/work/app"),
      repo("/clients/acme/app"),
      repo("/work/other"),
    ]);

    expect(labels.map((label) => label.text)).toEqual([
      "app — work",
      "app — acme",
      "other",
    ]);
  });

  it("falls back to the full path when even the folder repeats", () => {
    const labels = labelTabs([repo("/a/shared/app"), repo("/b/shared/app")]);

    expect(labels.map((label) => label.text)).toEqual([
      "/a/shared/app",
      "/b/shared/app",
    ]);
  });

  it("reads Windows paths too", () => {
    const labels = labelTabs([
      repo("C:\\work\\app"),
      repo("D:\\clients\\acme\\app"),
    ]);

    expect(labels.map((label) => label.text)).toEqual([
      "app — work",
      "app — acme",
    ]);
  });

  it("never produces two identical labels", () => {
    const labels = labelTabs([
      repo("/a/x/app"),
      repo("/b/x/app"),
      repo("/c/y/app"),
    ]);

    const texts = labels.map((label) => label.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("keeps the bare name for a project at the root", () => {
    const labels = labelTabs([repo("/app"), repo("/work/app")]);

    expect(labels.map((label) => label.text)).toEqual(["app", "app — work"]);
  });

  it("labels nothing for an empty row", () => {
    expect(labelTabs([])).toEqual([]);
  });
});
