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
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/bindings.ts", "src/**/*.{test,spec}.{ts,tsx}"],
      reporter: ["text-summary", "lcov"],
      thresholds: {
        // The layout algorithm concentrates the most value and is the hardest
        // thing in the project to verify by looking at the screen, so it
        // carries a higher bar than everything else.
        "src/lib/graph-layout/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
