import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// .env.test (gitignore) → hoshin_test veritabanı. Worker process.env'ine enjekte edilir,
// böylece @/lib/prisma istemcisi import edildiğinde doğru DATABASE_URL'i okur.
const testEnv = dotenv.config({ path: path.resolve(process.cwd(), ".env.test") }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts", "test/**/*.itest.ts"],
    setupFiles: ["test/integration.setup.ts"],
    globalSetup: ["test/integration.globalSetup.ts"],
    env: testEnv,
    // Tek paylaşılan DB → testler seri çalışmalı (dosyalar arası paralellik kapalı).
    pool: "forks",
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
