import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: { conditions: ["browser"] },
  test: {
    environment: "jsdom",
    globals: true,
    server: { deps: { inline: ["svelte"] } },
    // Unit tests live in tests/; Playwright specs in e2e/ run separately.
    include: ["tests/**/*.test.ts"],
  },
});
