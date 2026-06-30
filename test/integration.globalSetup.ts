import { execSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

/**
 * Entegrasyon testleri başlamadan **bir kez**: şemayı hoshin_test'e uygula.
 * (Migration dizini yok — N5; `db push` idempotandır.)
 */
export default function setup(): void {
  const env = dotenv.config({ path: path.resolve(process.cwd(), ".env.test") }).parsed ?? {};
  execSync("./node_modules/.bin/prisma db push --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}
