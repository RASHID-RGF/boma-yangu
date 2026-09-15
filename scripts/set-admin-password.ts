import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'user@gmail.com';
  const password = process.env.ADMIN_PASSWORD || 'password123';

  // Hash the password with bcrypt (matches the app's verifyPassword)
  const passwordHash = await bcrypt.hash(password, 12);

  // Find the user first
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Create the user if they don't exist
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'SUPER_ADMIN',
        isVerified: true,
        isTwoFactorEnabled: false,
      },
    });
    console.log(`✅ Created new user ${email} with role SUPER_ADMIN`);
    console.log(`   Password: ${password}`);
    return;
  }

  // Update the existing user
  const updated = await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      role: 'SUPER_ADMIN',
      isVerified: true,
      isTwoFactorEnabled: false,
    },
    select: {
      email: true,
      role: true,
      isVerified: true,
    },
  });

  console.log(`✅ Updated ${email}`);
  console.log(`   Role: ${updated.role}`);
  console.log(`   Password: ${password}`);
  console.log('   You can now log in at /login with these credentials.');
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
