import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function getSqliteFilePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const rawPath = databaseUrl.slice("file:".length).split("?")[0];
  if (!rawPath) {
    return null;
  }

  if (rawPath.startsWith("//")) {
    return rawPath.slice(1);
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(process.cwd(), rawPath);
}

function ensureVercelSqliteBootstrap() {
  const dbUrl = process.env.DATABASE_URL;
  if (!process.env.VERCEL || !dbUrl) {
    return;
  }

  const dbPath = getSqliteFilePath(dbUrl);
  if (!dbPath || !dbPath.startsWith("/tmp/")) {
    return;
  }

  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    return;
  }

  const templatePath = path.join(process.cwd(), "prisma", "base.db");
  if (!fs.existsSync(templatePath)) {
    throw new Error("Missing prisma/base.db for Vercel SQLite bootstrap");
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(templatePath, dbPath);
}

ensureVercelSqliteBootstrap();

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
