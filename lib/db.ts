import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — add it to your Vercel environment variables");
  const adapter = new PrismaPg({
    connectionString: url,
    ssl: url.includes("neon.tech") || url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// Lazy singleton — only created when first accessed, not at module import time
let _client: PrismaClient | undefined;
function getClient() {
  if (!_client) {
    _client = globalForPrisma.prisma ?? createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = _client;
  }
  return _client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
