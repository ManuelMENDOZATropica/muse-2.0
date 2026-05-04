require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Connecting...");
  try {
    const p = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: "698f28e3-a165-4034-9552-39d8d14c2028" },
          { isPublic: true }
        ]
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        nodes: {
          include: { createdBy: { select: { id: true, name: true, avatar: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    console.log("Success:", p.length);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}
main();
