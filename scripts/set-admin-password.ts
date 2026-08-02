import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'user@gmail.com';
  const password = process.env.ADMIN_PASSWORD || 'password123';

  // Hash the password with bcrypt (matches the app's verifyPassword)
  const passwordHash = await bcrypt.hash(password, 12);

  // Use a raw update because the hand-inserted document may be missing
  // fields like updatedAt that Prisma requires on deserialization.
  // NOTE: $currentDate sets a real BSON Date server-side — passing a JS Date
  // through $runCommandRaw would serialize it to an ISO string, which Prisma
  // cannot deserialize back into a DateTime.
  const result = await prisma.$runCommandRaw({
    update: 'users',
    updates: [
      {
        q: { email },
        u: {
          $set: {
            passwordHash,
            role: 'SUPER_ADMIN',
            isVerified: true,
            isTwoFactorEnabled: false,
          },
          $currentDate: { updatedAt: true },
        },
      },
    ],
  });

  console.log('=== UPDATE RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  const found = await prisma.$runCommandRaw({ find: 'users', filter: { email }, limit: 1 });
  console.log('\n=== VERIFY ===');
  console.log(JSON.stringify(found, null, 2));

  console.log(`\n✅ Updated ${email}`);
  console.log(`   Role: SUPER_ADMIN`);
  console.log(`   Password: ${password}`);
  console.log('   You can now log in at /login with these credentials.');
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
