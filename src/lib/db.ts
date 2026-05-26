import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? [
            { level: "query", emit: "event" },
            { level: "warn", emit: "event" },
            { level: "error", emit: "event" },
          ]
        : [
            { level: "query", emit: "event" },
            { level: "warn", emit: "event" },
            { level: "error", emit: "event" },
          ],
  });

// Log slow queries (>500ms) in production
if (process.env.NODE_ENV === "production") {
  // @ts-expect-error — Prisma event types
  prisma.$on("query", (e: { duration: number; query?: string; params?: string }) => {
    if (e.duration > 500) {
      console.warn("[SLOW QUERY]", {
        query: e.query?.slice(0, 200),
        duration: e.duration,
        params: e.params?.slice(0, 100),
      });
    }
  });
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
