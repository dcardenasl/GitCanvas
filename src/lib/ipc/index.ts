/**
 * Typed wrappers over the generated bindings.
 *
 * Components import from here, never from `bindings.ts` directly. The
 * generated file is regenerated from Rust on every build, so anything that
 * depends on its exact shape belongs behind this boundary — when a command
 * signature changes, one file breaks instead of every call site.
 */
import { commands } from "../../bindings";
import type { AppInfo } from "../../bindings";

export type { AppInfo };

/**
 * Round-trips the IPC boundary and reports what is running.
 */
export async function ping(): Promise<AppInfo> {
  return commands.ping();
}
