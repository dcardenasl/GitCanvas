import { useEffect, useState } from "react";

import { ping, type AppInfo } from "./lib/ipc";

import "./App.css";

/**
 * Application shell.
 *
 * Renders the engine it is talking to, which is the visible proof that the
 * Rust to TypeScript round trip works. The commit graph replaces this in
 * phase 2.
 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ping()
      .then(setInfo)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  return (
    <main className="app-shell">
      <p className="app-shell__title">GitCanvas</p>
      {error !== null && <p className="app-shell__error">{error}</p>}
      {info !== null && (
        <p className="app-shell__meta">
          v{info.version} · engine {info.core_version}
        </p>
      )}
    </main>
  );
}
