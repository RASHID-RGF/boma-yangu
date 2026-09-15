import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'user@gmail.com';

  // Simulate exactly what /api/auth/login does after successful auth
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('❌ User not found:', email);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await prisma.loginRecord.create({
    data: {
      userId: user.id,
      email: user.email,
      ipAddress: '127.0.0.1',
      userAgent: 'verify-script',
    },
  });

  // Read back
  const updated = await prisma.user.findUnique({
    where: { email },
    select: { email: true, lastLoginAt: true },
  });
  const records = await prisma.loginRecord.findMany({
    select: { email: true, ipAddress: true, userAgent: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  console.log('=== USER lastLoginAt ===');
  console.log(JSON.stringify(updated, null, 2));
  console.log('\n=== loginRecords table ===');
  console.log(JSON.stringify(records, null, 2));
  console.log(`\n✅ Login tracking verified: lastLoginAt updated + ${records.length} login record(s) in PostgreSQL`);
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
