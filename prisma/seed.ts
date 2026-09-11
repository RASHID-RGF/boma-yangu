import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'password123';

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000);
const inMonth = (offset: number): { month: number; year: number } => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
};
const thisMonth = inMonth(0);
const lastMonth = inMonth(-1);

async function main() {
  console.log('🌱 Seeding Boma Yangu database...');

  // Children before parents, so re-seeding is always safe.
  await prisma.activityLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.loginRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.backup.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.document.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.maintenanceRequest.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.caretakerAssignment.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // ============ USERS ============
  const admin = await prisma.user.create({
    data: {
      email: 'admin@bomayangu.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Super',
      role: 'SUPER_ADMIN',
      phone: '0700000000',
      isVerified: true,
      idNumber: '10000001',
      kraPin: 'A001234567Z',
      lastLoginAt: daysAgo(0),
    },
  });

  const landlord = await prisma.user.create({
    data: {
      email: 'landlord@bomayangu.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Kamau',
      role: 'LANDLORD',
      phone: '0712345678',
      isVerified: true,
      idNumber: '10000002',
      kraPin: 'A002345678Z',
      lastLoginAt: daysAgo(1),
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

  const caretaker1 = await prisma.user.create({
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

  const caretaker2 = await prisma.user.create({
    data: {
      email: 'caretaker2@bomayangu.com',
      passwordHash,
      firstName: 'Grace',
      lastName: 'Achieng',
      role: 'CARETAKER',
      phone: '0734567891',
      isVerified: true,
    },
  });

  const tenantUser = await prisma.user.create({
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

  const tenantUser2 = await prisma.user.create({
    data: {
      email: 'tenant2@bomayangu.com',
      passwordHash,
      firstName: 'Samuel',
      lastName: 'Mwangi',
      role: 'TENANT',
      phone: '0756789012',
      isVerified: true,
    },
  });

  // Every tenant profile gets a working login — Faith Chebet lives in W1 but
  // previously had no user account, so she could never see her invoices or pay.
  const tenantUser3 = await prisma.user.create({
    data: {
      email: 'faith@bomayangu.com',
      passwordHash,
      firstName: 'Faith',
      lastName: 'Chebet',
      role: 'TENANT',
      phone: '0767890123',
      isVerified: true,
    },
  });

  console.log(`✅ Users created (all use password "${PASSWORD}")`);

  console.log('✅ Users done');

  // ============ PROPERTIES ============
  const greenHeights = await prisma.property.create({
    data: {
      name: 'Green Heights Apartments',
      description: 'Modern apartment complex in Kilimani with borehole water and backup generator.',
      type: 'APARTMENT',
      status: 'OCCUPIED',
      address: 'Argwings Kodhek Road, Kilimani',
      city: 'Nairobi',
      country: 'Kenya',
      totalUnits: 4,
      occupiedUnits: 2,
      monthlyIncome: 87_000,
      images: [],
      ownerId: landlord.id,
      managerId: manager.id,
    },
  });

  const westview = await prisma.property.create({
    data: {
      name: 'Westview Court',
      description: 'Gated community of maisonettes in Westlands with ample parking.',
      type: 'MAISONETTE',
      status: 'VACANT',
      address: 'Rhapta Road, Westlands',
      city: 'Nairobi',
      country: 'Kenya',
      totalUnits: 3,
      occupiedUnits: 1,
      monthlyIncome: 95_000,
      images: [],
      ownerId: landlord.id,
      managerId: manager.id,
    },
  });

  // ============ UNITS ============
  const unitA01 = await prisma.unit.create({
    data: {
      unitNumber: 'A01',
      description: 'Spacious 2-bedroom with balcony facing the courtyard',
      floorNumber: 1,
      monthlyRent: 45_000,
      depositAmount: 45_000,
      waterCharge: 1_500,
      garbageCharge: 300,
      serviceCharge: 2_000,
      status: 'OCCUPIED',
      bedrooms: 2,
      bathrooms: 1,
      size: 80,
      propertyId: greenHeights.id,
    },
  });

  const unitA02 = await prisma.unit.create({
    data: {
      unitNumber: 'A02',
      description: '2-bedroom, master ensuite',
      floorNumber: 1,
      monthlyRent: 42_000,
      depositAmount: 42_000,
      waterCharge: 1_500,
      garbageCharge: 300,
      serviceCharge: 2_000,
      status: 'OCCUPIED',
      bedrooms: 2,
      bathrooms: 2,
      size: 75,
      propertyId: greenHeights.id,
    },
  });

  const unitA03 = await prisma.unit.create({
    data: {
      unitNumber: 'A03',
      description: '2-bedroom, recently repainted',
      floorNumber: 2,
      monthlyRent: 48_000,
      depositAmount: 48_000,
      waterCharge: 1_500,
      garbageCharge: 300,
      serviceCharge: 2_000,
      status: 'VACANT',
      bedrooms: 2,
      bathrooms: 1,
      size: 80,
      propertyId: greenHeights.id,
    },
  });

  const unitA04 = await prisma.unit.create({
    data: {
      unitNumber: 'A04',
      description: 'Bedsitter, ideal for a young professional',
      floorNumber: 2,
      monthlyRent: 18_000,
      depositAmount: 18_000,
      waterCharge: 500,
      garbageCharge: 300,
      serviceCharge: 1_000,
      status: 'VACANT',
      bedrooms: 1,
      bathrooms: 1,
      propertyId: greenHeights.id,
    },
  });

  const unitW1 = await prisma.unit.create({
    data: {
      unitNumber: 'W1',
      description: '3-bedroom maisonette with private garden',
      monthlyRent: 95_000,
      depositAmount: 95_000,
      waterCharge: 2_500,
      garbageCharge: 500,
      serviceCharge: 3_000,
      parkingCharge: 3_000,
      status: 'OCCUPIED',
      bedrooms: 3,
      bathrooms: 2,
      size: 160,
      propertyId: westview.id,
    },
  });

  const unitW2 = await prisma.unit.create({
    data: {
      unitNumber: 'W2',
      description: '3-bedroom maisonette, DSQ included',
      monthlyRent: 100_000,
      depositAmount: 100_000,
      waterCharge: 2_500,
      garbageCharge: 500,
      serviceCharge: 3_000,
      status: 'VACANT',
      bedrooms: 3,
      bathrooms: 2,
      propertyId: westview.id,
    },
  });

  const unitW3 = await prisma.unit.create({
    data: {
      unitNumber: 'W3',
      description: '4-bedroom all-ensuite maisonette',
      monthlyRent: 120_000,
      depositAmount: 120_000,
      waterCharge: 2_500,
      garbageCharge: 500,
      serviceCharge: 3_000,
      parkingCharge: 3_000,
      status: 'VACANT',
      bedrooms: 4,
      bathrooms: 3,
      size: 200,
      propertyId: westview.id,
    },
  });

  await prisma.caretakerAssignment.create({
    data: { caretakerId: caretaker1.id, propertyId: greenHeights.id },
  });
  await prisma.caretakerAssignment.create({
    data: { caretakerId: caretaker2.id, propertyId: westview.id },
  });

  // ============ TENANTS ============
  const mary = await prisma.tenant.create({
    data: {
      firstName: 'Mary',
      lastName: 'Nyambura',
      email: 'tenant@bomayangu.com',
      phone: '0745678901',
      idNumber: '31234567',
      kraPin: 'A009876543Z',
      emergencyName: 'James Nyambura',
      emergencyPhone: '0745678902',
      emergencyRelation: 'Brother',
      moveInDate: daysAgo(400),
      isActive: true,
      unitId: unitA01.id,
      userId: tenantUser.id,
    },
  });

  const samuel = await prisma.tenant.create({
    data: {
      firstName: 'Samuel',
      lastName: 'Mwangi',
      email: 'tenant2@bomayangu.com',
      phone: '0756789012',
      idNumber: '32345678',
      kraPin: 'A008765432Z',
      emergencyName: 'Esther Mwangi',
      emergencyPhone: '0756789013',
      emergencyRelation: 'Wife',
      moveInDate: daysAgo(180),
      isActive: true,
      unitId: unitA02.id,
      userId: tenantUser2.id,
    },
  });

  const faith = await prisma.tenant.create({
    data: {
      firstName: 'Faith',
      lastName: 'Chebet',
      email: 'faith.chebet@example.com',
      phone: '0767890123',
      idNumber: '33456789',
      moveInDate: daysAgo(90),
      isActive: true,
      unitId: unitW1.id,
      userId: tenantUser3.id,
    },
  });

  // Former tenant — shows history without a live lease.
  await prisma.tenant.create({
    data: {
      firstName: 'Brian',
      lastName: 'Otieno',
      email: 'brian.otieno@example.com',
      phone: '0778901234',
      moveInDate: daysAgo(700),
      moveOutDate: daysAgo(60),
      isActive: false,
    },
  });

  console.log('✅ Properties, units, tenants done');

  // ============ LEASES ============
  const leaseMary = await prisma.lease.create({
    data: {
      startDate: daysAgo(400),
      endDate: daysAhead(330),
      monthlyRent: 45_000,
      depositAmount: 45_000,
      terms: 'Rent due by the 5th of every month. Quiet hours from 10pm. No subletting.',
      status: 'ACTIVE',
      isDigitalSignature: true,
      tenantId: mary.id,
      unitId: unitA01.id,
      createdById: landlord.id,
    },
  });

  const leaseSamuel = await prisma.lease.create({
    data: {
      startDate: daysAgo(180),
      endDate: daysAhead(185),
      monthlyRent: 42_000,
      depositAmount: 42_000,
      terms: 'Rent due by the 5th. Utilities per meter reading attached to invoice.',
      status: 'ACTIVE',
      isDigitalSignature: true,
      tenantId: samuel.id,
      unitId: unitA02.id,
      createdById: manager.id,
    },
  });

  const leaseFaith = await prisma.lease.create({
    data: {
      startDate: daysAgo(90),
      endDate: daysAhead(275),
      monthlyRent: 95_000,
      depositAmount: 190_000,
      terms: 'Rent due by the 5th. Garden maintenance included in service charge.',
      status: 'ACTIVE',
      tenantId: faith.id,
      unitId: unitW1.id,
      createdById: landlord.id,
    },
  });

  // ============ INVOICES ============
  const nextSeq = (() => {
    let n = 0;
    return () => ++n;
  })();
  const pad3 = (v: number) => String(v).padStart(3, '0');

  const mkInvoice = (
    tenant: { id: string },
    unit: { id: string; monthlyRent: number; waterCharge: number; garbageCharge: number; serviceCharge: number },
    m: { month: number; year: number },
    opts: { dueInDays: number; amountPaid: number; status: string }
  ) => {
    const rentAmount = unit.monthlyRent;
    const extras = unit.waterCharge + unit.garbageCharge + unit.serviceCharge;
    const total = rentAmount + extras;
    const paid = Math.min(opts.amountPaid, total);
    return prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${m.year}${String(m.month).padStart(2, '0')}-${pad3(nextSeq())}`,
        month: m.month,
        year: m.year,
        rentAmount,
        waterCharge: unit.waterCharge,
        garbageCharge: unit.garbageCharge,
        serviceCharge: unit.serviceCharge,
        totalAmount: total,
        amountPaid: paid,
        balance: total - paid,
        dueDate: daysAhead(opts.dueInDays),
        status: opts.status,
        tenantId: tenant.id,
        unitId: unit.id,
        createdById: manager.id,
      },
    });
  };

  const invMaryLast = await mkInvoice(mary, unitA01, lastMonth, { dueInDays: -20, amountPaid: 48_800, status: 'PAID' });
  const invMaryThis = await mkInvoice(mary, unitA01, thisMonth, { dueInDays: 5, amountPaid: 24_400, status: 'SENT' });
  const invSamuelLast = await mkInvoice(samuel, unitA02, lastMonth, { dueInDays: -20, amountPaid: 45_800, status: 'PAID' });
  const invSamuelThis = await mkInvoice(samuel, unitA02, thisMonth, { dueInDays: 5, amountPaid: 0, status: 'SENT' });
  const invFaith = await mkInvoice(faith, unitW1, thisMonth, { dueInDays: 5, amountPaid: 101_000, status: 'PAID' });

  // ============ PAYMENTS ============
  const payFaith = await prisma.payment.create({
    data: {
      amount: 101_000,
      description: 'Rent payment - Faith Chebet (W1)',
      status: 'COMPLETED',
      method: 'BANK_TRANSFER',
      receiptNumber: 'RCPT-0004',
      paymentDate: daysAgo(2),
      recordedAt: daysAgo(2),
      isPartial: false,
      balanceBefore: 101_000,
      balanceAfter: 0,
      tenantId: faith.id,
      unitId: unitW1.id,
      recordedById: manager.id,
      invoiceId: invFaith.id,
    },
  });

  const payMaryLast = await prisma.payment.create({
    data: {
      amount: 48_800,
      description: 'Rent payment - Mary Nyambura (A01)',
      status: 'COMPLETED',
      method: 'MPESA_STK_PUSH',
      transactionCode: 'Sgh7Kd92Lm',
      receiptNumber: 'RCPT-0001',
      paymentDate: daysAgo(35),
      recordedAt: daysAgo(35),
      isPartial: false,
      balanceBefore: 48_800,
      balanceAfter: 0,
      tenantId: mary.id,
      unitId: unitA01.id,
      recordedById: manager.id,
      invoiceId: invMaryLast.id,
    },
  });

  const payMaryPartial = await prisma.payment.create({
    data: {
      amount: 24_400,
      description: 'Partial rent payment - Mary Nyambura (A01)',
      status: 'COMPLETED',
      method: 'MPESA_STK_PUSH',
      transactionCode: 'Qwe4Rt8Yui',
      receiptNumber: 'RCPT-0002',
      paymentDate: daysAgo(3),
      recordedAt: daysAgo(3),
      isPartial: true,
      balanceBefore: 48_800,
      balanceAfter: 24_400,
      tenantId: mary.id,
      unitId: unitA01.id,
      recordedById: manager.id,
      invoiceId: invMaryThis.id,
    },
  });

  const paySamuelLast = await prisma.payment.create({
    data: {
      amount: 45_800,
      description: 'Rent payment - Samuel Mwangi (A02)',
      status: 'COMPLETED',
      method: 'MPESA_PAYBILL',
      transactionCode: 'Asd5Fg6Hjk',
      receiptNumber: 'RCPT-0003',
      paymentDate: daysAgo(34),
      recordedAt: daysAgo(34),
      isPartial: false,
      balanceBefore: 45_800,
      balanceAfter: 0,
      tenantId: samuel.id,
      unitId: unitA02.id,
      recordedById: manager.id,
      invoiceId: invSamuelLast.id,
    },
  });

  // A pending M-Pesa STK push to exercise the PENDING flow in the UI.
  await prisma.payment.create({
    data: {
      amount: 24_400,
      description: 'Rent balance - current month (M-Pesa STK push initiated)',
      status: 'PENDING',
      method: 'MPESA_STK_PUSH',
      checkoutRequestId: 'ws_CO_20260910_000111',
      phoneNumber: '0745678901',
      paymentDate: now,
      recordedAt: now,
      tenantId: mary.id,
      unitId: unitA01.id,
      recordedById: manager.id,
      invoiceId: invMaryThis.id,
    },
  });

  console.log('✅ Leases, invoices, payments done');

  // ============ MAINTENANCE REQUESTS ============
  const mr1 = await prisma.maintenanceRequest.create({
    data: {
      title: 'Kitchen tap leaking',
      description: 'The cold water tap in the kitchen drips continuously even when fully closed.',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      estimatedCost: 2_500,
      scheduledDate: daysAhead(2),
      tenantId: mary.id,
      unitId: unitA01.id,
      reportedById: tenantUser.id,
      assignedToId: caretaker1.id,
    },
  });

  await prisma.maintenanceRequest.create({
    data: {
      title: 'Bedroom window latch broken',
      description: 'The main bedroom window does not lock; security concern.',
      priority: 'HIGH',
      status: 'ASSIGNED',
      estimatedCost: 1_200,
      tenantId: samuel.id,
      unitId: unitA02.id,
      reportedById: tenantUser2.id,
      assignedToId: caretaker1.id,
    },
  });

  await prisma.maintenanceRequest.create({
    data: {
      title: 'Gate intercom not working',
      description: 'Intercom at the main gate has no sound; visitors cannot call in.',
      priority: 'HIGH',
      status: 'REPORTED',
      tenantId: faith.id,
      unitId: unitW1.id,
      reportedById: tenantUser3.id,
    },
  });

  await prisma.maintenanceRequest.create({
    data: {
      title: 'Repaint stairwell after water damage',
      description: 'Stairwell walls on 2nd floor stained after plumbing leak was fixed.',
      priority: 'LOW',
      status: 'COMPLETED',
      estimatedCost: 8_000,
      actualCost: 7_500,
      scheduledDate: daysAgo(10),
      completedDate: daysAgo(6),
      notes: 'Paid to painter in cash, receipts filed.',
      tenantId: mary.id,
      unitId: unitA01.id,
      reportedById: manager.id,
      assignedToId: caretaker1.id,
    },
  });

  // ============ DOCUMENTS ============
  await prisma.document.createMany({
    data: [
      {
        name: 'Lease Agreement - Mary Nyambura (A01)',
        type: 'LEASE',
        url: 'https://example.com/docs/lease-mary-a01.pdf',
        size: 182_400,
        mimeType: 'application/pdf',
        uploadedById: landlord.id,
        tenantId: mary.id,
        leaseId: leaseMary.id,
        propertyId: greenHeights.id,
      },
      {
        name: 'Lease Agreement - Samuel Mwangi (A02)',
        type: 'LEASE',
        url: 'https://example.com/docs/lease-samuel-a02.pdf',
        size: 180_200,
        mimeType: 'application/pdf',
        uploadedById: manager.id,
        tenantId: samuel.id,
        leaseId: leaseSamuel.id,
        propertyId: greenHeights.id,
      },
      {
        name: 'Invoice current month - Faith Chebet (W1)',
        type: 'INVOICE',
        url: 'https://example.com/docs/inv-faith-w1.pdf',
        size: 96_000,
        mimeType: 'application/pdf',
        uploadedById: manager.id,
        tenantId: faith.id,
        invoiceId: invFaith.id,
        propertyId: westview.id,
      },
    ],
  });

  // ============ MESSAGES ============
  await prisma.message.createMany({
    data: [
      {
        subject: 'Water supply interruption on Saturday',
        content: 'Dear tenants, Nairobi Water will shut off supply this Saturday 9am-4pm for maintenance. Backup tanks will cover the interruption.',
        isRead: false,
        senderId: manager.id,
        receiverId: tenantUser.id,
      },
      {
        subject: 'RE: Water supply interruption on Saturday',
        content: 'Thank you for the heads-up. Will the backup cover hot water in the morning?',
        isRead: true,
        readAt: daysAgo(1),
        senderId: tenantUser.id,
        receiverId: manager.id,
      },
      {
        subject: 'Maintenance visit confirmation',
        content: 'Caretaker Peter will come by Thursday 10am to fix the kitchen tap. Will you be home?',
        isRead: false,
        senderId: caretaker1.id,
        receiverId: tenantUser.id,
      },
      {
        subject: 'Rent receipt request',
        content: "Could you send me the receipt for last month's payment for my records?",
        isRead: false,
        senderId: tenantUser2.id,
        receiverId: landlord.id,
      },
    ],
  });

  // ============ NOTIFICATIONS ============
  await prisma.notification.createMany({
    data: [
      {
        type: 'PAYMENT',
        title: 'Payment received',
        message: 'Mary Nyambura paid KES 48,800 via M-Pesa (Sgh7Kd92Lm).',
        isRead: true,
        readAt: daysAgo(35),
        sentViaSms: true,
        userId: landlord.id,
        createdAt: daysAgo(35),
      },
      {
        type: 'MAINTENANCE',
        title: 'New maintenance request',
        message: 'Mary Nyambura reported "Kitchen tap leaking" in unit A01.',
        isRead: false,
        userId: manager.id,
        createdAt: daysAgo(4),
      },
      {
        type: 'INVOICE',
        title: 'Invoice overdue',
        message: `Invoice ${invSamuelThis.invoiceNumber} for Samuel Mwangi is overdue.`,
        isRead: false,
        userId: landlord.id,
        createdAt: daysAgo(1),
      },
      {
        type: 'LEASE',
        title: 'Lease expiring soon',
        message: 'Mary Nyambura\u2019s lease for A01 expires in 11 months. Consider renewal.',
        isRead: false,
        userId: manager.id,
        createdAt: daysAgo(2),
      },
      {
        type: 'SYSTEM',
        title: 'Welcome to Boma Yangu',
        message: 'Your account was created. Complete your profile to get started.',
        isRead: true,
        readAt: daysAgo(29),
        userId: tenantUser.id,
        createdAt: daysAgo(30),
      },
    ],
  });

  // ============ ACTIVITY LOGS ============
  await prisma.activityLog.createMany({
    data: [
      {
        action: 'SEED',
        description: 'Database seeded with full demo dataset',
        entityType: 'SYSTEM',
        userId: admin.id,
      },
      {
        action: 'PAYMENT_RECORDED',
        description: 'KES 101,000 bank transfer recorded for Faith Chebet (W1)',
        entityType: 'PAYMENT',
        entityId: payFaith.id,
        userId: manager.id,
        propertyId: westview.id,
      },
      {
        action: 'MAINTENANCE_ASSIGNED',
        description: 'Kitchen tap leak assigned to caretaker Peter Ochieng',
        entityType: 'MAINTENANCE',
        entityId: mr1.id,
        userId: manager.id,
        maintenanceId: mr1.id,
        propertyId: greenHeights.id,
      },
      {
        action: 'LEASE_CREATED',
        description: 'Lease created for Samuel Mwangi in unit A02',
        entityType: 'LEASE',
        entityId: leaseSamuel.id,
        userId: manager.id,
        propertyId: greenHeights.id,
      },
    ],
  });

  // ============ AUDIT LOGS ============
  await prisma.auditLog.createMany({
    data: [
      {
        action: 'USER_LOGIN',
        entityType: 'USER',
        entityId: landlord.id, userId: landlord.id,
        ipAddress: '41.90.64.10',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: daysAgo(1),
      },
      {
        action: 'ROLE_CHANGED',
        entityType: 'USER',
        entityId: caretaker2.id,
        userId: admin.id,
        oldValue: { role: 'TENANT' },
        newValue: { role: 'CARETAKER' },
        ipAddress: '41.90.64.10',
        createdAt: daysAgo(3),
      },
    ],
  });

  // ============ LOGIN RECORDS ============
  await prisma.loginRecord.createMany({
    data: [
      { userId: landlord.id, email: landlord.email, ipAddress: '41.90.64.10', userAgent: 'Mozilla/5.0 (Macintosh)', createdAt: daysAgo(1) },
      { userId: manager.id, email: manager.email, ipAddress: '41.90.64.11', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', createdAt: daysAgo(2) },
      { userId: tenantUser.id, email: tenantUser.email, ipAddress: '105.160.20.5', userAgent: 'Mozilla/5.0 (Linux; Android 13)', createdAt: daysAgo(0) },
    ],
  });

  // ============ BACKUP RECORD ============
  await prisma.backup.create({
    data: {
      filename: `bomayangu-backup-${now.toISOString().slice(0, 10)}.archive`,
      size: 1_048_576,
      status: 'COMPLETED',
      completedAt: daysAgo(1),
    },
  });

  // ============ SUMMARY ============
  const counts = {
    users: await prisma.user.count(),
    properties: await prisma.property.count(),
    units: await prisma.unit.count(),
    tenants: await prisma.tenant.count(),
    leases: await prisma.lease.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
    maintenanceRequests: await prisma.maintenanceRequest.count(),
    documents: await prisma.document.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
    activityLogs: await prisma.activityLog.count(),
    auditLogs: await prisma.auditLog.count(),
    loginRecords: await prisma.loginRecord.count(),
    caretakerAssignments: await prisma.caretakerAssignment.count(),
    sessions: await prisma.session.count(),
    backups: await prisma.backup.count(),
  };

  console.log('📊 Records per collection:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k.padEnd(22)} ${v}`);
  }
  console.log(`🎉 Seed complete! Log in with any seeded email + password "${PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
