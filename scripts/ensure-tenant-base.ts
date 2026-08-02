import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Non-destructive bootstrap: creates ONLY the missing base records needed for the
// tenant section demo (users, property, unit, tenant record, lease). It never
// deletes or modifies existing records, so the user's data is preserved.
async function main() {
  console.log('🌱 Ensuring base records exist (non-destructive)...');

  const passwordHash = await bcrypt.hash('password123', 12);

  // --- Users ---
  let landlord = await prisma.user.findUnique({ where: { email: 'landlord@bomayangu.com' } });
  if (!landlord) {
    landlord = await prisma.user.create({
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
    console.log('   + created landlord@bomayangu.com');
  }

  let caretaker = await prisma.user.findUnique({ where: { email: 'caretaker@bomayangu.com' } });
  if (!caretaker) {
    caretaker = await prisma.user.create({
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
    console.log('   + created caretaker@bomayangu.com');
  }

  let tenantUser = await prisma.user.findUnique({ where: { email: 'tenant@bomayangu.com' } });
  if (!tenantUser) {
    tenantUser = await prisma.user.create({
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
    console.log('   + created tenant@bomayangu.com');
  }

  // --- Property ---
  let property = await prisma.property.findFirst({ where: { name: 'Green Heights Apartments' } });
  if (!property) {
    property = await prisma.property.create({
      data: {
        name: 'Green Heights Apartments',
        description: 'Modern apartment complex in Kilimani',
        type: 'APARTMENT',
        status: 'OCCUPIED',
        address: 'Kilimani',
        city: 'Nairobi',
        country: 'Kenya',
        totalUnits: 1,
        occupiedUnits: 1,
        monthlyIncome: 45000,
        ownerId: landlord.id,
        managerId: landlord.id,
      },
    });
    console.log('   + created Green Heights Apartments');
  }

  // --- Unit ---
  let unit = await prisma.unit.findFirst({ where: { unitNumber: 'A01' } });
  if (!unit) {
    unit = await prisma.unit.create({
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
    console.log('   + created unit A01');
  }

  // --- Tenant record ---
  let tenantRecord = await prisma.tenant.findFirst({ where: { userId: tenantUser.id } });
  if (!tenantRecord) {
    tenantRecord = await prisma.tenant.create({
      data: {
        firstName: 'Mary',
        lastName: 'Nyambura',
        email: 'tenant@bomayangu.com',
        phone: '0745678901',
        isActive: true,
        unitId: unit.id,
        userId: tenantUser.id,
      },
    });
    console.log('   + created tenant record linked to tenant@bomayangu.com');
  } else if (!tenantRecord.unitId) {
    tenantRecord = await prisma.tenant.update({
      where: { id: tenantRecord.id },
      data: { unitId: unit.id },
    });
    console.log('   + linked existing tenant record to unit A01');
  }

  // --- Lease ---
  const existingLease = await prisma.lease.findFirst({ where: { tenantId: tenantRecord.id } });
  if (!existingLease) {
    const now = new Date();
    await prisma.lease.create({
      data: {
        startDate: now,
        endDate: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
        monthlyRent: 45000,
        depositAmount: 45000,
        status: 'ACTIVE',
        tenantId: tenantRecord.id,
        unitId: unit.id,
        createdById: landlord.id,
      },
    });
    console.log('   + created lease');
  }

  console.log('✅ Base records ensured.');
  console.log('💡 Now run: npx tsx scripts/seed-tenant-data.ts');
}

main()
  .catch((e) => {
    console.error('❌ Bootstrap failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
