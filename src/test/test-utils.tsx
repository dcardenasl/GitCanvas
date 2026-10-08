import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";
import type { Mock } from "vitest";
import type * as Ipc from "../lib/ipc";

type IpcModule = typeof Ipc;
type IpcFunctionKey = {
  [Key in keyof IpcModule]: IpcModule[Key] extends (...args: never[]) => unknown
    ? Key
    : never;
}[keyof IpcModule];
type MockedIpc<Keys extends IpcFunctionKey> = {
  [Key in Keys]: IpcModule[Key] extends (...args: infer Args) => infer Result
    ? Mock<(...args: Args) => Result>
    : never;
};

/** Creates a fresh React Query client whose queries and mutations never retry. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Creates a provider wrapper for component and hook tests.
 *
 * @param client - Cache to expose to the rendered tree; defaults to a fresh test client.
 * @returns A Testing Library provider component.
 */
export function createQueryClientWrapper(
  client: QueryClient = createTestQueryClient(),
): ({ children }: { readonly children: ReactNode }) => ReactElement {
  return function QueryClientWrapper({ children }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Renders a component under an isolated React Query client.
 *
 * @param ui - Component tree under test.
 * @param client - Optional cache to inspect or prepopulate in the test.
 * @param options - Testing Library options other than its provider wrapper.
 * @returns The render result and the client used by the provider.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient(),
  options?: Omit<RenderOptions, "wrapper">,
) {
  return {
    client,
    ...render(ui, { ...options, wrapper: createQueryClientWrapper(client) }),
  };
}

/**
 * Creates typed Vitest mocks for selected functions from the IPC boundary.
 *
 * @param names - IPC exports that the test replaces.
 * @returns A partial IPC module containing a mock for each selected export.
 */
export function createIpcMocks<const Names extends readonly IpcFunctionKey[]>(
  names: Names,
): MockedIpc<Names[number]> {
  return Object.fromEntries(
    names.map((name) => [name, vi.fn()]),
  ) as unknown as MockedIpc<Names[number]>;
}
