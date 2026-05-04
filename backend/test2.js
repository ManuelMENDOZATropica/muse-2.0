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
      include: {
        owner: true,
        nodes: { include: { createdBy: true } }
      }
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
