// @vitest-environment jsdom
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../test/test-utils";
import { resetWorkspace, openTestProject } from "../../test/workspace";
import { useWorkspace } from "../../state/workspace";
import { UnreachableProject } from "./UnreachableProject";

const mock = vi.hoisted(() => ({ open: vi.fn(), repository: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mock.open }));
vi.mock("../../lib/ipc", () => ({ openRepository: mock.repository }));
vi.mock("../../lib/paint", () => ({ afterPaint: () => Promise.resolve() }));

beforeEach(() => {
  resetWorkspace();
  openTestProject();
  useWorkspace.getState().setVerification("/tmp/repo", {
    status: "unreachable",
    error: new Error("missing folder"),
  });
  vi.clearAllMocks();
});
afterEach(cleanup);

function renderRecovery(retry = vi.fn()) {
  renderWithQueryClient(
    <UnreachableProject
      root="/tmp/repo"
      error={new Error("missing folder")}
      retry={retry}
    />,
  );
  return retry;
}

it("offers retry and close without deleting a favorite", async () => {
  useWorkspace.setState({ favorites: ["/tmp/repo"] });
  const retry = renderRecovery();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(useWorkspace.getState().tabs).toHaveLength(0);
  expect(useWorkspace.getState().favorites).toEqual(["/tmp/repo"]);
});

it("locates through authorization and replaces the broken tab", async () => {
  mock.open.mockResolvedValue("/tmp/alias");
  mock.repository.mockResolvedValue({ path: "/tmp/moved", name: "moved" });
  renderRecovery();
  await userEvent.click(
    screen.getByRole("button", { name: "Localizar carpeta…" }),
  );
  await waitFor(() => {
    expect(useWorkspace.getState().activeRoot).toBe("/tmp/moved");
  });
  expect(mock.repository).toHaveBeenCalledWith("/tmp/alias");
  expect(useWorkspace.getState().tabs).toHaveLength(1);
});

it("reuses an already open target, preserving its session and removing only the broken tab", async () => {
  openTestProject({ path: "/tmp/other", name: "other" });
  useWorkspace.getState().activate("/tmp/repo");
  useWorkspace.getState().setVerification("/tmp/repo", {
    status: "unreachable",
    error: new Error("missing folder"),
  });
  const target = useWorkspace.getState().tabs[1];
  mock.open.mockResolvedValue("/tmp/other");
  mock.repository.mockResolvedValue({ path: "/tmp/other", name: "other" });
  renderRecovery();
  await userEvent.click(
    screen.getByRole("button", { name: "Localizar carpeta…" }),
  );
  await waitFor(() => {
    expect(useWorkspace.getState().tabs).toHaveLength(1);
  });
  expect(useWorkspace.getState().tabs[0]?.navigation).toBe(target?.navigation);
  expect(useWorkspace.getState().activeRoot).toBe("/tmp/other");
});

it("keeps the original tab after cancellation or failed authorization", async () => {
  mock.open
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce("/tmp/not-a-repo");
  mock.repository.mockRejectedValue(new Error("not a repository"));
  renderRecovery();
  const locate = screen.getByRole("button", { name: "Localizar carpeta…" });
  await userEvent.click(locate);
  expect(mock.repository).not.toHaveBeenCalled();
  await userEvent.click(locate);
  expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
  expect(useWorkspace.getState().activeRoot).toBe("/tmp/repo");
});
