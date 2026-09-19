import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Local runs use the committed .env (DATABASE_URL). On serverless hosts
// (Vercel) the filesystem is read-only except /tmp, so the SQLite file is
// kept there — ensureSchema() in lib/importer recreates tables on boot and
// the data/ folder import repopulates the library, so posting keeps working.
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.VERCEL ? 'file:/tmp/social-agent.db' : 'file:./db/custom.db')

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
