import { defineConfig } from "vitest/config";
import path from "path";

// Mirrors tsconfig.json's "@/*" path alias so Vitest resolves imports the
// same way Next.js does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
