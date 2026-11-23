import { describe, expect, it } from "vitest";

import { EMPTY_NAVIGATION, revealCommit } from "./navigation";
import { closeRelease, openRelease } from "./releaseNavigation";
import { openStash } from "./stashNavigation";
import { stashEntry } from "../test/stash";

describe("release inspection navigation", () => {
  it("opens a release without changing the selected commit or history anchor", () => {
    const underlying = {
      ...revealCommit("commit-1")(EMPTY_NAVIGATION),
      historyAnchor: "commit-2",
    };

    const opened = openRelease("9007199254740993")(underlying);

    expect(opened.releaseView).toEqual({ releaseId: "9007199254740993" });
    expect(opened.selection).toEqual(underlying.selection);
    expect(opened.historyAnchor).toBe("commit-2");
  });

  it("returns to the same Git context and lets deliberate commit navigation close it", () => {
    const opened = openRelease("release-1")(EMPTY_NAVIGATION);

    expect(closeRelease(opened)).toMatchObject({
      releaseView: null,
      selection: { kind: "history" },
    });
    expect(revealCommit("commit-1")(opened)).toMatchObject({
      releaseView: null,
      selection: { kind: "commit", commitId: "commit-1" },
    });
  });

  it("keeps release and stash inspection mutually exclusive", () => {
    const release = openRelease("release-1")(EMPTY_NAVIGATION);
    const stash = openStash(stashEntry())(release);

    expect(stash.releaseView).toBeNull();
    expect(stash.stash).not.toBeNull();
    expect(openRelease("release-2")(stash).stash).toBeNull();
  });
});
