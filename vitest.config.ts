// vitest.config.ts — alias ya "@/…" kama ile ya tsconfig/Next (tests zinaweza ku-import modules zozote).
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
