import { describe, expect, it } from "vitest";

import { resolveMarkdownLink } from "./markdownLinks";

describe("resolveMarkdownLink", () => {
  it("accepts arbitrary HTTPS hosts and normalizes their URL", () => {
    expect(
      resolveMarkdownLink(
        "https://docs.example.test:8443/a path",
        "https://github.com/example/project/releases/tag/v1",
      ),
    ).toBe("https://docs.example.test:8443/a%20path");
  });

  it("resolves relative release links against the GitHub release page", () => {
    expect(
      resolveMarkdownLink(
        "../compare/v0.8...v0.9",
        "https://github.com/example/project/releases/tag/v0.9",
      ),
    ).toBe("https://github.com/example/project/releases/compare/v0.8...v0.9");
  });

  it("rejects non-HTTPS schemes, credentials, malformed URLs and controls", () => {
    for (const destination of [
      "http://example.test",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "mailto:help@example.test",
      "https://user:secret@example.test",
      "https://example.test/\nnext",
      "https://",
    ]) {
      expect(resolveMarkdownLink(destination, null)).toBeNull();
    }
  });

  it("does not resolve relative links without a valid HTTPS release page", () => {
    expect(resolveMarkdownLink("../compare", null)).toBeNull();
    expect(
      resolveMarkdownLink("../compare", "http://github.com/example/project"),
    ).toBeNull();
  });

  it("rejects destinations above the documented 8 KiB URL limit", () => {
    expect(
      resolveMarkdownLink(`https://example.test/${"a".repeat(8200)}`, null),
    ).toBeNull();
  });
});
