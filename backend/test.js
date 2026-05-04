const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const p = await prisma.project.findMany({
      include: {
        owner: true,
        nodes: {
          include: { createdBy: true }
        }
      }
    });
    console.log("Success:", p.length);
  } catch (e) {
    console.error("Prisma Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
