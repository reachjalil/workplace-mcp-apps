import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/server.test.ts", "tests/data.test.ts"],
    testTimeout: 15000,
    hookTimeout: 20000,
    restoreMocks: true,
  },
});
