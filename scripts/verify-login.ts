import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'user@gmail.com';
  const password = process.env.ADMIN_PASSWORD || 'password123';

  // Full (non-select) read — exactly what /api/auth/login does
  const user = await prisma.user.findUnique({ where: { email } });
  console.log('=== FULL PRISMA READ (login path) ===');
  console.log(JSON.stringify(user, null, 2));

  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  // Simulate verifyPassword from /api/auth/login
  const isValid = await bcrypt.compare(password, user.passwordHash);
  console.log(`\n=== PASSWORD VERIFY (${password}) ===`);
  console.log(isValid ? '✅ Password is valid — login will succeed' : '❌ Password mismatch');
  console.log(`Role: ${user.role} (${user.role === 'SUPER_ADMIN' ? 'can access /admin' : 'cannot access /admin'})`);

  if (!isValid || user.role !== 'SUPER_ADMIN') process.exit(1);
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
