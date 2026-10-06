import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: "jsdom",
    globals: true,
    // Unit tests live in tests/; Playwright specs in e2e/ run separately.
    include: ["tests/**/*.test.ts"],
  },
});
