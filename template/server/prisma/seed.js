import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('Seeding database...\n');

  const hashedPassword = await bcrypt.hash('changeme123', SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@forge.local' },
    update: {},
    create: {
      email: 'admin@forge.local',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log(`  Admin user: ${admin.email} (id: ${admin.id})`);

  const user = await prisma.user.upsert({
    where: { email: 'user@forge.local' },
    update: {},
    create: {
      email: 'user@forge.local',
      password: hashedPassword,
      firstName: 'Regular',
      lastName: 'User',
      role: 'USER',
    },
  });
  console.log(`  Regular user: ${user.email} (id: ${user.id})`);

  console.log('\nSeeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
