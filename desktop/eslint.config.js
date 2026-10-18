// Flat config (eslint-plugin-svelte v3 no longer ships eslintrc presets).
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "build/",
      "dist/",
      ".svelte-kit/",
      "src-tauri/",
      "static/",
      "*.config.js",
      "*.config.ts",
      "test-results/",
      "playwright-report/",
      ".e2e-data/",
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  ...svelte.configs["flat/recommended"],
  prettier,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // v3 recommended flags every <a href> / goto() that skips `resolve()`.
      // That only matters for apps served under a base path; this one is a
      // static build loaded at the webview root.
      "svelte/no-navigation-without-resolve": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: { parser: tsParser, extraFileExtensions: [".svelte"] },
    },
  },
];
