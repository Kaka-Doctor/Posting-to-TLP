/** Clean up the misleading values captured during diagnostics */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  await db.settings.update({
    where: { id: 'settings' },
    data: {
      publicBaseUrl: '', // fcapp.run gateway is not Meta-reachable
      tokenExpiresAt: null, // re-exchange reported no expiry — page token never expires anyway
    },
  })
  console.log('cleaned: publicBaseUrl cleared, tokenExpiresAt reset')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
