import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function resolveDatabaseUrl() {
  const raw = (process.env.DATABASE_URL || "").trim();
  const neonCandidates = [
    process.env.fotofacil_DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL_NON_POOLING
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean);

  const neon = neonCandidates[0] || "";
  if (neon && (!raw || raw.startsWith("file:"))) {
    return neon;
  }
  return raw || neon || "";
}

const resolvedDatabaseUrl = resolveDatabaseUrl();
if (resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
