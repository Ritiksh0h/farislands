import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      defineProject({
        test: {
          name: "node",
          environment: "node",
          include: ["shared/src/**/*.test.ts", "server/src/**/*.test.ts"],
        },
      }),
      defineProject({
        test: {
          name: "client",
          environment: "happy-dom",
          include: ["client/src/**/*.test.{ts,tsx}"],
        },
      }),
    ],
  },
});
