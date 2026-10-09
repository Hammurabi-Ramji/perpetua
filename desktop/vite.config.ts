import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";

// SvelteKit 3 reads its configuration from the sveltekit() plugin;
// svelte.config.js is no longer supported.
export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      prerender: {
        handleUnseenRoutes: "ignore",
      },
      adapter: adapter({
        pages: "build",
        assets: "build",
        fallback: "index.html",
        precompress: false,
        strict: false,
      }),
    }),
    // Resolve Svelte's browser build under vitest (otherwise mount() is the
    // server stub) and auto-cleanup between tests.
    svelteTesting(),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    // Unit tests live in tests/; Playwright specs in e2e/ run separately.
    include: ["tests/**/*.test.ts"],
  },
});
