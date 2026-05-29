import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Create test users
  const jamie = await prisma.user.upsert({
    where: { phone: '+447700000001' },
    update: {},
    create: {
      phone: '+447700000001',
      displayName: 'Jamie',
    },
  });

  const sam = await prisma.user.upsert({
    where: { phone: '+447700000002' },
    update: {},
    create: {
      phone: '+447700000002',
      displayName: 'Sam',
    },
  });

  const alex = await prisma.user.upsert({
    where: { phone: '+447700000003' },
    update: {},
    create: {
      phone: '+447700000003',
      displayName: 'Alex',
    },
  });

  const riley = await prisma.user.upsert({
    where: { phone: '+447700000004' },
    update: {},
    create: {
      phone: '+447700000004',
      displayName: 'Riley',
    },
  });

  // Create a test group
  const group = await prisma.group.create({
    data: {
      name: 'The Lads',
      createdBy: jamie.id,
      members: {
        create: [
          { userId: jamie.id, role: 'admin' },
          { userId: sam.id, role: 'member' },
          { userId: alex.id, role: 'member' },
          { userId: riley.id, role: 'member' },
        ],
      },
    },
  });

  // Add a sample status for Jamie
  await prisma.status.create({
    data: {
      userId: jamie.id,
      availability: 'free',
      location: 'my_place',
      vibe: 'im_paying',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
    },
  });

  console.log(`Created group "${group.name}" with 4 members`);
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
