import { describe, expect, it } from "vitest";

import type { ReleaseListEntryIpc } from "../../bindings";
import {
  formatReleaseDate,
  latestStableReleaseId,
} from "./releasePresentation";

function release(
  id: string,
  publishedAt: string | null,
  prerelease = false,
): ReleaseListEntryIpc {
  return {
    kind: "release",
    release: {
      id,
      tag_name: `v${id}`,
      name: null,
      notes: "",
      html_url: `https://github.com/example/project/releases/tag/v${id}`,
      prerelease,
      published_at: publishedAt,
    },
    local_tag: null,
  };
}

describe("release presentation", () => {
  it("chooses the newest dated stable release and keeps the first on a tie", () => {
    expect(
      latestStableReleaseId([
        release("old", "2025-11-01T00:00:00Z"),
        release("prerelease", "2027-01-01T00:00:00Z", true),
        release("undated", null),
        release("invalid", "not-a-date"),
        release("newest", "2026-11-01T00:00:00Z"),
        release("tie", "2026-11-01T00:00:00Z"),
      ]),
    ).toBe("newest");
  });

  it("does not invent a latest release for empty, undated, or prerelease-only lists", () => {
    expect(latestStableReleaseId([])).toBeNull();
    expect(
      latestStableReleaseId([
        release("undated", null),
        release("invalid", "not-a-date"),
        release("prerelease", "2027-01-01T00:00:00Z", true),
      ]),
    ).toBeNull();
  });

  it("keeps invalid publication dates readable rather than displaying Invalid Date", () => {
    expect(formatReleaseDate("not-a-date", "en")).toBe("not-a-date");
  });
});
