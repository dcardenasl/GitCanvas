import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "./components/AppShell";
import { queryRetryDelay, shouldRetryQuery } from "./lib/query-retry";

import "./App.css";

/**
 * One client for the whole application.
 *
 * Created outside the component so a re-render never discards the cache; a
 * client rebuilt on render silently refetches every page of history.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Only transient descriptor exhaustion is retried; see the policy.
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      /*
       * Coming back to the window is exactly when work done elsewhere should
       * appear. The filesystem watch already covers most of it; this is the
       * cheap safety net for when the watch could not be established, and it
       * costs a few milliseconds against a local repository.
       */
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
