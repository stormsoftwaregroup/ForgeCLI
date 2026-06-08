import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanTestData() {
  // Delete test-created records (not seed data) in dependency order
  await prisma.refreshToken.deleteMany({
    where: {
      user: {
        email: {
          endsWith: '@dbtest.local',
        },
      },
    },
  });
  await prisma.refreshToken.deleteMany({
    where: {
      user: {
        email: {
          endsWith: '@authtest.local',
        },
      },
    },
  });
  await prisma.errorLog.deleteMany({
    where: { message: { startsWith: '[TEST]' } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: '@dbtest.local' } },
        { email: { endsWith: '@authtest.local' } },
      ],
    },
  });
}

export { prisma, cleanTestData };
