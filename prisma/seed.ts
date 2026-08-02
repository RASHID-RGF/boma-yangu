import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.activityLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.document.deleteMany();
  await prisma.maintenanceRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.caretakerAssignment.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 12);

  // Create users
  const landlord = await prisma.user.create({
    data: {
      email: 'landlord@bomayangu.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Kamau',
      role: 'LANDLORD',
      phone: '0712345678',
      isVerified: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@bomayangu.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Wanjiku',
      role: 'MANAGER',
      phone: '0723456789',
      isVerified: true,
    },
  });

  const caretaker = await prisma.user.create({
    data: {
      email: 'caretaker@bomayangu.com',
      passwordHash,
      firstName: 'Peter',
      lastName: 'Ochieng',
      role: 'CARETAKER',
      phone: '0734567890',
      isVerified: true,
    },
  });

  const tenant = await prisma.user.create({
    data: {
      email: 'tenant@bomayangu.com',
      passwordHash,
      firstName: 'Mary',
      lastName: 'Nyambura',
      role: 'TENANT',
      phone: '0745678901',
      isVerified: true,
    },
  });

  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@bomayangu.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Super',
      role: 'SUPER_ADMIN',
      phone: '0700000000',
      isVerified: true,
    },
  });

  console.log('✅ Users created:');
  console.log(`   - Landlord: landlord@bomayangu.com / password123`);
  console.log(`   - Manager: manager@bomayangu.com / password123`);
  console.log(`   - Caretaker: caretaker@bomayangu.com / password123`);
  console.log(`   - Tenant: tenant@bomayangu.com / password123`);
  console.log(`   - Admin: admin@bomayangu.com / password123`);

  // Create a sample property
  const property = await prisma.property.create({
    data: {
      name: 'Green Heights Apartments',
      description: 'Modern apartment complex in Kilimani',
      type: 'APARTMENT',
      status: 'OCCUPIED',
      address: 'Kilimani',
      city: 'Nairobi',
      country: 'Kenya',
      totalUnits: 4,
      occupiedUnits: 2,
      monthlyIncome: 180000,
      ownerId: landlord.id,
      managerId: manager.id,
    },
  });

  // Create units
  const unit1 = await prisma.unit.create({
    data: {
      unitNumber: 'A01',
      monthlyRent: 45000,
      depositAmount: 45000,
      status: 'OCCUPIED',
      bedrooms: 2,
      bathrooms: 1,
      propertyId: property.id,
    },
  });

  await prisma.unit.create({
    data: {
      unitNumber: 'A02',
      monthlyRent: 42000,
      depositAmount: 42000,
      status: 'OCCUPIED',
      bedrooms: 2,
      bathrooms: 1,
      propertyId: property.id,
    },
  });

  await prisma.unit.create({
    data: {
      unitNumber: 'A03',
      monthlyRent: 48000,
      depositAmount: 48000,
      status: 'VACANT',
      bedrooms: 2,
      bathrooms: 1,
      propertyId: property.id,
    },
  });

  await prisma.unit.create({
    data: {
      unitNumber: 'A04',
      monthlyRent: 45000,
      depositAmount: 45000,
      status: 'VACANT',
      bedrooms: 2,
      bathrooms: 1,
      propertyId: property.id,
    },
  });

  // Create a tenant record
  const tenantRecord = await prisma.tenant.create({
    data: {
      firstName: 'Mary',
      lastName: 'Nyambura',
      email: 'tenant@bomayangu.com',
      phone: '0745678901',
      isActive: true,
      unitId: unit1.id,
      userId: tenant.id,
    },
  });

  // Create a lease
  await prisma.lease.create({
    data: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      monthlyRent: 45000,
      depositAmount: 45000,
      status: 'ACTIVE',
      tenantId: tenantRecord.id,
      unitId: unit1.id,
      createdById: landlord.id,
    },
  });

  console.log('✅ Sample property, units, tenant, and lease created');

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'SEED',
      description: 'Database seeded with test data',
      entityType: 'SYSTEM',
      userId: superAdmin.id,
    },
  });

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
