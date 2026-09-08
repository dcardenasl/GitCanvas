import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "target", "src-tauri/target", "src/bindings.ts"] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // `any` erases every guarantee the rest of this config buys.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },

  /*
   * The graph layout boundary.
   *
   * `lib/graph-layout/` is the most valuable code in the project and the
   * easiest to break without noticing, so it stays a pure function of its
   * input: no React, no DOM, no IPC. Enforced here rather than by convention,
   * and again by running its tests in a `node` environment where `window`
   * does not exist at all.
   *
   * If something in here ever needs `document`, the responsibility is in the
   * wrong place — it belongs in a component.
   */
  {
    files: ["src/lib/graph-layout/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Self-contained by construction: anything reachable only by
              // climbing out of this directory is, by definition, not part of
              // the layout algorithm.
              group: ["..", "../*", "../**"],
              message:
                "graph-layout must stay self-contained: it cannot import from outside its own directory.",
            },
            {
              group: ["react", "react-*", "@tauri-apps/*"],
              message:
                "graph-layout must stay pure: no React, no DOM, no IPC. Move this to a component or an ipc wrapper.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "graph-layout must not touch the DOM." },
        { name: "document", message: "graph-layout must not touch the DOM." },
        { name: "navigator", message: "graph-layout must not touch the DOM." },
        { name: "localStorage", message: "graph-layout must stay stateless." },
      ],
    },
  },

  // Config files run in node and are not part of the app's type graph.
  {
    files: ["*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
