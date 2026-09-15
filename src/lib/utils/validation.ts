import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
}).refine(
  (data) => data.email || data.phone,
  { message: 'Enter your email or phone number', path: ['email'] },
);

export const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  role: z.enum(['LANDLORD', 'TENANT']),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const propertySchema = z.object({
  name: z.string().min(2, 'Property name is required'),
  description: z.string().optional(),
  type: z.enum(['APARTMENT', 'BEDSITTER', 'SINGLE_ROOM', 'MAISONETTE', 'COMMERCIAL', 'VILLA', 'TOWNHOUSE']),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().optional(),
  country: z.string().default('Kenya'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  images: z.array(z.string()).optional(),
});

export const unitSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number is required'),
  description: z.string().optional(),
  floorNumber: z.number().optional(),
  monthlyRent: z.number().positive('Rent must be positive'),
  depositAmount: z.number().min(0, 'Deposit cannot be negative'),
  utilityCharges: z.number().min(0).default(0),
  waterCharge: z.number().min(0).default(0),
  electricityCharge: z.number().min(0).default(0),
  garbageCharge: z.number().min(0).default(0),
  serviceCharge: z.number().min(0).default(0),
  internetCharge: z.number().min(0).default(0),
  parkingCharge: z.number().min(0).default(0),
  bedrooms: z.number().int().min(0).default(1),
  bathrooms: z.number().int().min(1).default(1),
  size: z.number().positive().optional(),
  images: z.array(z.string()).optional(),
  propertyId: z.string().min(1, 'Property is required'),
});

export const tenantSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(10, 'Valid phone number is required'),
  idNumber: z.string().optional().or(z.literal('')),
  kraPin: z.string().optional().or(z.literal('')),
  emergencyName: z.string().optional().or(z.literal('')),
  emergencyPhone: z.string().optional().or(z.literal('')),
  emergencyRelation: z.string().optional().or(z.literal('')),
  unitId: z.string().optional().or(z.literal('')),
});

export const paymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['MPESA_STK_PUSH', 'MPESA_PAYBILL', 'MPESA_TILL_NUMBER', 'BANK_TRANSFER', 'CASH']),
  description: z.string().optional(),
  tenantId: z.string().min(1, 'Tenant is required'),
  unitId: z.string().min(1, 'Unit is required'),
  invoiceId: z.string().optional(),
  transactionCode: z.string().optional(),
});

export const maintenanceSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  unitId: z.string().min(1, 'Unit is required'),
  images: z.array(z.string()).optional(),
});

export const leaseSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  monthlyRent: z.number().positive('Rent must be positive'),
  depositAmount: z.number().min(0),
  terms: z.string().optional(),
  tenantId: z.string().min(1, 'Tenant is required'),
  unitId: z.string().min(1, 'Unit is required'),
});

export const invoiceSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  rentAmount: z.number().positive(),
  waterCharge: z.number().min(0).default(0),
  electricityCharge: z.number().min(0).default(0),
  garbageCharge: z.number().min(0).default(0),
  serviceCharge: z.number().min(0).default(0),
  internetCharge: z.number().min(0).default(0),
  parkingCharge: z.number().min(0).default(0),
  otherCharges: z.number().min(0).default(0),
  dueDate: z.string().min(1),
  notes: z.string().optional(),
  // Optional because a tenant sending an invoice has their tenant/unit derived
  // from their account server-side; management may send tenantId without unitId
  // (the unit is resolved from the tenant record).
  tenantId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
});
