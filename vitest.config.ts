import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest is configured for the framework-agnostic logic in `src/lib` (the rules
 * engine, the day-accounting calculator and the optimizer). These are plain
 * TypeScript modules with no React/Next coupling, so the default `node`
 * environment is all we need. The `@` alias mirrors tsconfig so tests can import
 * the same way the app does.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
