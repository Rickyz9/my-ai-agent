import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

function bootstrapDatabaseEnv() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(currentDir, "../../../");
  const envPath = path.join(workspaceRoot, ".env");

  if (existsSync(envPath)) {
    const contents = readFileSync(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${path.join(workspaceRoot, "data", "app.db")}`;
  }
}

bootstrapDatabaseEnv();

declare global {
  var __repoPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__repoPrisma__ ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__repoPrisma__ = prisma;
}

export * from "@prisma/client";
