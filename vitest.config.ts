import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /*
     * `node` is the default on purpose, not an oversight.
     *
     * The graph layout must never touch the DOM, and the surest way to
     * guarantee that is to run its tests where `window` does not exist at all.
     * A component test that genuinely needs a DOM opts in explicitly with a
     * `// @vitest-environment jsdom` docblock, which makes the dependency
     * visible in the file that has it.
     */
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/bindings.ts",
        "src/test-setup.ts",
        // Entry points: they only mount the tree, and the end-to-end suite is
        // what proves they do.
        "src/main.tsx",
        "src/App.tsx",
        "src/**/*.{test,spec}.{ts,tsx}",
      ],
      reporter: ["text-summary", "lcov"],
      thresholds: {
        // Floors for the whole project, set just under what the suite reaches
        // so a change that stops testing what it adds fails here instead of
        // eroding the number quietly.
        statements: 90,
        branches: 80,
        functions: 88,
        lines: 90,
        // The layout algorithm concentrates the most value and is the hardest
        // thing in the project to verify by looking at the screen, so it
        // carries a higher bar than everything else.
        "src/lib/graph-layout/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // State decides what the interface believes about the repository.
        "src/state/**": {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
        "src/components/**": {
          statements: 88,
          branches: 78,
          functions: 85,
          lines: 88,
        },
      },
    },
  },
});
