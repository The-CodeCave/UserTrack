import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["src/**/*.test.ts", "convex/**/*.test.ts"], environment: "node", server: { deps: { inline: ["convex-test"] } } },
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "@convex": path.resolve(__dirname, "convex"), "@usertrack/protocol": path.resolve(__dirname, "packages/protocol/src/index.ts"), "@usertrack/node": path.resolve(__dirname, "packages/node/src/index.ts") } },
});
