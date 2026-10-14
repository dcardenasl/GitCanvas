import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { fileURLToPath } from "node:url";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Classic (IIFE) workers: module workers need WebKit 15, and the macOS
  // minimum this app declares ships an older WebView.
  worker: { format: "iife" as const },

  resolve: {
    alias: {
      // The highlighter runs in a worker, which has no `document`. This
      // package's "browser" entry decodes HTML entities through a DOM node,
      // and Vite picks it over its "worker" entry, so the worker would throw
      // on load. Node's resolution picks the pure-JS entry.
      "decode-named-character-reference": fileURLToPath(
        import.meta.resolve("decode-named-character-reference"),
      ),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
