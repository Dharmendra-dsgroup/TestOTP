import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "build"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["app/utils/**", "app/lib/otp/**", "app/config/plans.ts"],
      exclude: ["app/routes/**", "app/entry.*", "app/shopify.server.ts"],
    },
    // Prevent test files from importing Remix server modules that need a
    // full request context (authenticate, session storage, etc.)
    server: {
      deps: {
        // Force ESM resolution for these CJS packages in test environment
        inline: ["mongoose"],
      },
    },
  },
});
