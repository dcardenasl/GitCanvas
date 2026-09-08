// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RepositoryInfo } from "../../bindings";

const open = vi.fn<(options: unknown) => Promise<string | null>>();
const openRepository = vi.fn<(path: string) => Promise<RepositoryInfo>>();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (options: unknown) => open(options),
}));
vi.mock("../../lib/ipc", () => ({
  openRepository: (path: string) => openRepository(path),
  IpcError: class extends Error {},
}));

const { RepositoryPicker } = await import("./RepositoryPicker");
const { useSession } = await import("../../state/session");

/** A promise the test resolves when it chooses to, to observe the wait. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSession.setState({ repository: null });
});
afterEach(cleanup);

describe("RepositoryPicker", () => {
  it("shows it is busy while the native panel is coming up", async () => {
    // The panel takes long enough that a button reacting only once it is up
    // looks broken for the whole wait.
    const panel = deferred<string | null>();
    open.mockReturnValue(panel.promise);

    render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.textContent).toContain("Elige una carpeta…");

    panel.resolve(null);
  });

  it("returns the button to normal when the panel is dismissed", async () => {
    open.mockResolvedValue(null);

    render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));

    // Cancelling must not leave the button disabled forever.
    await waitFor(() => {
      expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
    });
    expect(screen.getByRole("button").textContent).toContain(
      "Abrir repositorio",
    );
  });

  it("never opens a second panel while one is up", async () => {
    const panel = deferred<string | null>();
    open.mockReturnValue(panel.promise);

    render(<RepositoryPicker />);
    const button = screen.getByRole("button");
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    // macOS stacks panels behind each other, which is unrecoverable from the
    // interface.
    await waitFor(() => {
      expect(open).toHaveBeenCalledTimes(1);
    });
    panel.resolve(null);
  });

  it("paints the busy state before seizing the main thread", async () => {
    /*
     * The dialog is built on the main thread, which on macOS is the one the
     * WebView paints on. If the call goes out in the same frame as the state
     * change, the thread is taken before the spinner is ever rendered and the
     * button looks dead for the whole wait.
     */
    const panel = deferred<string | null>();
    open.mockReturnValue(panel.promise);

    render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));

    // Busy immediately...
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
    // ...and only then is the blocking call made.
    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });

    panel.resolve(null);
  });

  it("starts where it last opened", async () => {
    open.mockResolvedValue("/Users/x/code/repo");
    openRepository.mockResolvedValue({
      path: "/Users/x/code/repo",
      name: "repo",
    });

    const { unmount } = render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(useSession.getState().repository).not.toBeNull();
    });
    unmount();

    render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(open).toHaveBeenCalledTimes(2);
    });
    expect(open.mock.calls[1]?.[0]).toMatchObject({
      defaultPath: "/Users/x/code",
    });
  });

  it("omits the default path rather than passing undefined", async () => {
    open.mockResolvedValue(null);

    render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));

    // An explicit undefined is a different thing from an absent option.
    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    expect(open.mock.calls[0]?.[0]).not.toHaveProperty("defaultPath");
  });

  it("reports a failure and frees the button", async () => {
    open.mockResolvedValue("/not/a/repo");
    openRepository.mockRejectedValue(new Error("boom"));

    render(<RepositoryPicker />);
    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });
});
