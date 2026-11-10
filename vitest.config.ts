import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    clearMocks: true,
  },
});
