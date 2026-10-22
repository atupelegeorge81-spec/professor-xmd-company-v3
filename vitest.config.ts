// vitest.config.ts — alias ya "@/…" kama ile ya tsconfig/Next (tests zinaweza ku-import modules zozote).
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // TASK-34: tests za render (components .tsx) — tsconfig ya Next ina jsx "preserve"; tests tu zinahitaji transform
  oxc: { jsx: { runtime: "automatic" } },
  // backups/ = nakala za kumbukumbu za Rxx (si code ya sasa) — tests zake hazina dependencies zote
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "backups/**"],
  },
});
