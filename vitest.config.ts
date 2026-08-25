import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Hire track keeps hand-rolled assert runners (`npm run test:scout` etc.).
    exclude: [
      "src/features/hire/sample-card.test.ts",
      "src/features/hire/score-candidate.test.ts",
      "src/features/hire/scout-agent.test.ts",
      "src/features/hire/visibility.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
