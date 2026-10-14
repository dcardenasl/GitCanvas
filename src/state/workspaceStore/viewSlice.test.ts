import { beforeEach, describe, expect, it } from "vitest";

import { resetWorkspace } from "../../test/workspace";
import { useWorkspace } from "../workspace";

beforeEach(resetWorkspace);

const views = () => {
  const { homeOpen, githubOpen } = useWorkspace.getState();
  return { homeOpen, githubOpen };
};

describe("full-window views", () => {
  it("opening GitHub from home keeps home, and going home closes GitHub", () => {
    useWorkspace.getState().setHomeOpen(true);
    useWorkspace.getState().setGitHubOpen(true);
    expect(views()).toEqual({ homeOpen: true, githubOpen: true });

    useWorkspace.getState().setGitHubOpen(false);
    expect(views()).toEqual({ homeOpen: true, githubOpen: false });

    useWorkspace.getState().setGitHubOpen(true);
    useWorkspace.getState().setHomeOpen(true);
    expect(views()).toEqual({ homeOpen: true, githubOpen: false });
  });

  it("closing GitHub does not touch the home view", () => {
    useWorkspace.getState().setHomeOpen(true);

    useWorkspace.getState().setGitHubOpen(false);

    expect(views()).toEqual({ homeOpen: true, githubOpen: false });
  });

  it("are left by activating a project, in the same update", () => {
    useWorkspace.getState().openProject({ path: "/work/a", name: "a" });
    useWorkspace.getState().openProject({ path: "/work/b", name: "b" });
    useWorkspace.getState().setGitHubOpen(true);

    useWorkspace.getState().activate("/work/a");

    expect(views()).toEqual({ homeOpen: false, githubOpen: false });
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
