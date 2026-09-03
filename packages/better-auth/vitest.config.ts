import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@usertrack/protocol": path.resolve(__dirname, "../protocol/src/index.ts"), "@usertrack/node": path.resolve(__dirname, "../node/src/index.ts") } },
});
