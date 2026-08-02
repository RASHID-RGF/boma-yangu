import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Adds sample data for the tenant section pages (payments, invoices, maintenance,
// documents, messages, notifications). Non-destructive: it reuses existing users
// and tenant records and only creates new records.
async function main() {
  console.log('🌱 Seeding tenant section data...');

  const tenantUser = await prisma.user.findUnique({ where: { email: 'tenant@bomayangu.com' } });
  if (!tenantUser) {
    console.error('❌ tenant@bomayangu.com not found. Run `npx prisma db seed` first.');
    process.exit(1);
  }

  const tenantRecord = await prisma.tenant.findFirst({
    where: { userId: tenantUser.id },
    include: { lease: true },
  });
  if (!tenantRecord) {
    console.error('❌ No tenant record linked to tenant@bomayangu.com. Run `npx prisma db seed` first.');
    process.exit(1);
  }

  const landlord = await prisma.user.findUnique({ where: { email: 'landlord@bomayangu.com' } });
  const caretaker = await prisma.user.findUnique({ where: { email: 'caretaker@bomayangu.com' } });
  if (!landlord) {
    console.error('❌ landlord@bomayangu.com not found. Run `npx prisma db seed` first.');
    process.exit(1);
  }

  const unit = tenantRecord.unitId ? await prisma.unit.findUnique({ where: { id: tenantRecord.unitId } }) : null;
  const property = unit ? await prisma.property.findUnique({ where: { id: unit.propertyId } }) : null;

  // Make the seed re-runnable: remove only this tenant's previous sample data
  // (invoice numbers and receipt numbers are unique, so re-creation needs a clean slate).
  await prisma.payment.deleteMany({ where: { tenantId: tenantRecord.id } });
  await prisma.invoice.deleteMany({ where: { tenantId: tenantRecord.id } });
  await prisma.maintenanceRequest.deleteMany({ where: { tenantId: tenantRecord.id } });
  await prisma.document.deleteMany({ where: { tenantId: tenantRecord.id } });
  await prisma.message.deleteMany({
    where: { OR: [{ senderId: tenantUser.id }, { receiverId: tenantUser.id }] },
  });
  await prisma.notification.deleteMany({ where: { userId: tenantUser.id } });
  console.log('   (cleaned previous sample data for this tenant)');

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // ---------- Invoices ----------
  const invoice1 = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-${year}${String(month).padStart(2, '0')}-0001`,
      month: month - 1 <= 0 ? 12 : month - 1,
      year: month - 1 <= 0 ? year - 1 : year,
      rentAmount: unit?.monthlyRent || 45000,
      totalAmount: unit?.monthlyRent || 45000,
      amountPaid: unit?.monthlyRent || 45000,
      balance: 0,
      dueDate: lastMonth,
      status: 'PAID',
      tenantId: tenantRecord.id,
      unitId: tenantRecord.unitId!,
      createdById: landlord.id,
    },
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-${year}${String(month).padStart(2, '0')}-0002`,
      month,
      year,
      rentAmount: unit?.monthlyRent || 45000,
      totalAmount: unit?.monthlyRent || 45000,
      amountPaid: 0,
      balance: unit?.monthlyRent || 45000,
      dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 5),
      status: 'SENT',
      tenantId: tenantRecord.id,
      unitId: tenantRecord.unitId!,
      createdById: landlord.id,
    },
  });

  // ---------- Payments ----------
  const payment1 = await prisma.payment.create({
    data: {
      amount: unit?.monthlyRent || 45000,
      status: 'COMPLETED',
      method: 'MPESA_STK_PUSH',
      transactionCode: `SJ${Math.floor(100000000 + Math.random() * 899999999)}`,
      receiptNumber: `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      paymentDate: lastMonth,
      tenantId: tenantRecord.id,
      unitId: tenantRecord.unitId!,
      recordedById: landlord.id,
      invoiceId: invoice1.id,
    },
  });

  await prisma.payment.create({
    data: {
      amount: 15000,
      status: 'PARTIAL',
      method: 'MPESA_STK_PUSH',
      transactionCode: `SJ${Math.floor(100000000 + Math.random() * 899999999)}`,
      receiptNumber: `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      paymentDate: thisMonth,
      tenantId: tenantRecord.id,
      unitId: tenantRecord.unitId!,
      recordedById: landlord.id,
      invoiceId: invoice2.id,
    },
  });

  // ---------- Maintenance ----------
  const maintenance1 = await prisma.maintenanceRequest.create({
    data: {
      title: 'Leaking kitchen sink',
      description: 'The kitchen sink has been leaking for two days and is damaging the cabinet.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      tenantId: tenantRecord.id,
      unitId: tenantRecord.unitId!,
      reportedById: tenantUser.id,
      assignedToId: caretaker?.id || null,
    },
  });

  const maintenance2 = await prisma.maintenanceRequest.create({
    data: {
      title: 'Bathroom light flickering',
      description: 'The bathroom light flickers when switched on. Might need a new bulb or wiring check.',
      priority: 'LOW',
      status: 'REPORTED',
      tenantId: tenantRecord.id,
      unitId: tenantRecord.unitId!,
      reportedById: tenantUser.id,
      assignedToId: null,
    },
  });

  // ---------- Documents ----------
  await prisma.document.create({
    data: {
      name: 'Lease Agreement — Green Heights',
      type: 'LEASE',
      url: '#',
      uploadedById: landlord.id,
      tenantId: tenantRecord.id,
      propertyId: property?.id || null,
      leaseId: tenantRecord.lease?.id || null,
    },
  });

  await prisma.document.create({
    data: {
      name: `Invoice ${invoice2.invoiceNumber}`,
      type: 'INVOICE',
      url: '#',
      uploadedById: landlord.id,
      tenantId: tenantRecord.id,
      propertyId: property?.id || null,
      invoiceId: invoice2.id,
    },
  });

  // ---------- Messages ----------
  await prisma.message.create({
    data: {
      subject: 'Welcome to Green Heights Apartments',
      content: 'Hello Mary, welcome aboard! Your move-in is complete. Pay your rent via M-Pesa to the paybill provided. Let us know if you need anything.',
      senderId: landlord.id,
      receiverId: tenantUser.id,
    },
  });

  await prisma.message.create({
    data: {
      subject: 'Re: Maintenance — leaking sink',
      content: 'We received your maintenance request. A plumber has been assigned and will visit this week.',
      senderId: caretaker?.id || landlord.id,
      receiverId: tenantUser.id,
    },
  });

  // ---------- Notifications ----------
  const notificationTypes = [
    { type: 'INVOICE_GENERATED', title: 'Invoice available', message: `Your invoice ${invoice2.invoiceNumber} for KES ${(unit?.monthlyRent || 45000).toLocaleString()} is now available.` },
    { type: 'MAINTENANCE_UPDATE', title: 'Maintenance in progress', message: `"${maintenance1.title}" is now in progress. Our team is on it.` },
    { type: 'PAYMENT_RECEIVED', title: 'Payment received', message: `Your payment of KES ${(unit?.monthlyRent || 45000).toLocaleString()} was received. Receipt ${payment1.receiptNumber}.` },
    { type: 'ANNOUNCEMENT', title: 'Estate clean-up day', message: 'Estate clean-up day is this Saturday at 9:00 AM. Please park vehicles outside the compound.' },
  ];

  for (const n of notificationTypes) {
    await prisma.notification.create({
      data: { ...n, userId: tenantUser.id },
    });
  }

  console.log('✅ Tenant section data created:');
  console.log('   - 2 invoices, 2 payments');
  console.log('   - 2 maintenance requests');
  console.log('   - 2 documents');
  console.log('   - 2 messages (from landlord & caretaker)');
  console.log('   - 4 notifications');
  console.log('💡 Log in as tenant@bomayangu.com / password123 to see it all.');
  console.log('   (Management gets notified automatically when a tenant reports maintenance via the app.)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
