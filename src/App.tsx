import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "./components/AppShell";

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
      // Reading git is local and deterministic; retrying a failed read just
      // delays showing the user what went wrong.
      retry: false,
      refetchOnWindowFocus: false,
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
