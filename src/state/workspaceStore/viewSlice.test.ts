import { beforeEach, describe, expect, it } from "vitest";

import { resetWorkspace } from "../../test/workspace";
import { useWorkspace } from "../workspace";

beforeEach(resetWorkspace);

const views = () => {
  const { libraryView, githubOpen } = useWorkspace.getState();
  return { libraryView, githubOpen };
};

describe("full-window views", () => {
  it("never show the library and GitHub together", () => {
    useWorkspace.getState().setLibraryView("favorites");
    useWorkspace.getState().setGitHubOpen(true);
    expect(views()).toEqual({ libraryView: null, githubOpen: true });

    useWorkspace.getState().setLibraryView("recents");
    expect(views()).toEqual({ libraryView: "recents", githubOpen: false });
  });

  it("closing GitHub does not touch the library view", () => {
    useWorkspace.getState().setLibraryView("recents");

    useWorkspace.getState().setGitHubOpen(false);

    expect(views()).toEqual({ libraryView: "recents", githubOpen: false });
  });

  it("are left by activating a project, in the same update", () => {
    useWorkspace.getState().openProject({ path: "/work/a", name: "a" });
    useWorkspace.getState().openProject({ path: "/work/b", name: "b" });
    useWorkspace.getState().setGitHubOpen(true);

    useWorkspace.getState().activate("/work/a");

    expect(views()).toEqual({ libraryView: null, githubOpen: false });
    expect(useWorkspace.getState().recents[0]).toBe("/work/a");
  });

  it("do not erase the recents when a tab is activated before the bounds are known", () => {
    useWorkspace.getState().openProject({ path: "/work/a", name: "a" });
    useWorkspace.getState().openProject({ path: "/work/b", name: "b" });
    const before = useWorkspace.getState().recents;
    useWorkspace.setState({ limits: null });

    useWorkspace.getState().activate("/work/a");

    expect(useWorkspace.getState().recents).toEqual(before);
  });
});
