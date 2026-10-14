import { saveWorkspace } from "../lib/ipc";
import { useWorkspace } from "./workspace";
import { workspaceRecord } from "./workspaceRecords";

const NAVIGATION_DELAY = 300;
let revision = 0;

/**
 * One serialized writer per window. Structural changes enqueue immediately;
 * navigation is debounced. A failed snapshot remains dirty for explicit retry.
 * Flush includes changes arriving during a write, so closing cannot omit them.
 */
export function startWorkspacePersistence() {
  let durable = JSON.stringify(workspaceRecord(useWorkspace.getState()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let writing: Promise<void> | null = null;

  function cancelTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function flush(): Promise<void> {
    cancelTimer();
    pending ||=
      JSON.stringify(workspaceRecord(useWorkspace.getState())) !== durable;
    if (writing !== null) return writing;
    if (!pending) return Promise.resolve();

    writing = (async () => {
      while (pending) {
        pending = false;
        const workspace = workspaceRecord(useWorkspace.getState());
        const encoded = JSON.stringify(workspace);
        if (encoded === durable) continue;
        revision += 1;
        if (revision > 0xffff_ffff) {
          throw new Error("Workspace revision limit reached");
        }
        await saveWorkspace({ revision, workspace });
        durable = encoded;
        useWorkspace.getState().setStorageError(null);
        pending ||=
          JSON.stringify(workspaceRecord(useWorkspace.getState())) !== durable;
      }
    })()
      .catch((cause: unknown) => {
        pending = true;
        useWorkspace.getState().setStorageError(cause);
        throw cause;
      })
      .finally(() => {
        writing = null;
      });
    return writing;
  }

  const unsubscribe = useWorkspace.subscribe((state, previous) => {
    const current = workspaceRecord(state);
    if (JSON.stringify(current) === JSON.stringify(workspaceRecord(previous)))
      return;
    const structural =
      state.activeRoot !== previous.activeRoot ||
      state.favorites !== previous.favorites ||
      state.recents !== previous.recents ||
      JSON.stringify(current.tabs.map((tab) => tab.path)) !==
        JSON.stringify(previous.tabs.map((tab) => tab.repository.path));
    pending = true;
    cancelTimer();
    if (structural) void flush().catch(() => undefined);
    else
      timer = setTimeout(() => {
        void flush().catch(() => undefined);
      }, NAVIGATION_DELAY);
  });

  return {
    flush,
    stop: () => {
      unsubscribe();
      cancelTimer();
    },
  };
}
