// ============ ENUMS & CONSTANTS ============

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  LANDLORD = 'LANDLORD',
  MANAGER = 'MANAGER',
  CARETAKER = 'CARETAKER',
  TENANT = 'TENANT',
}

export enum PropertyType {
  APARTMENT = 'APARTMENT',
  BEDSITTER = 'BEDSITTER',
  SINGLE_ROOM = 'SINGLE_ROOM',
  MAISONETTE = 'MAISONETTE',
  COMMERCIAL = 'COMMERCIAL',
  VILLA = 'VILLA',
  TOWNHOUSE = 'TOWNHOUSE',
}

export enum PropertyStatus {
  OCCUPIED = 'OCCUPIED',
  VACANT = 'VACANT',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
}

export enum UnitStatus {
  OCCUPIED = 'OCCUPIED',
  VACANT = 'VACANT',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  RESERVED = 'RESERVED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIAL = 'PARTIAL',
}

export enum PaymentMethod {
  MPESA_STK_PUSH = 'MPESA_STK_PUSH',
  MPESA_PAYBILL = 'MPESA_PAYBILL',
  MPESA_TILL_NUMBER = 'MPESA_TILL_NUMBER',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CASH = 'CASH',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum MaintenanceStatus {
  REPORTED = 'REPORTED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum LeaseStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  RENEWED = 'RENEWED',
}

export enum NotificationType {
  RENT_DUE = 'RENT_DUE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  MAINTENANCE_UPDATE = 'MAINTENANCE_UPDATE',
  LEASE_EXPIRY = 'LEASE_EXPIRY',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
}

// ============ INTERFACES ============

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  idNumber?: string | null;
  kraPin?: string | null;
  isVerified: boolean;
  isTwoFactorEnabled: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Property {
  id: string;
  name: string;
  description?: string | null;
  type: PropertyType;
  status: PropertyStatus;
  address: string;
  city: string;
  state?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  totalUnits: number;
  occupiedUnits: number;
  monthlyIncome: number;
  expenses: number;
  images: string[];
  ownerId: string;
  managerId?: string | null;
  owner?: User;
  manager?: User;
  units?: Unit[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Unit {
  id: string;
  unitNumber: string;
  description?: string | null;
  floorNumber?: number | null;
  monthlyRent: number;
  depositAmount: number;
  utilityCharges: number;
  waterCharge: number;
  electricityCharge: number;
  garbageCharge: number;
  serviceCharge: number;
  internetCharge: number;
  parkingCharge: number;
  status: UnitStatus;
  bedrooms: number;
  bathrooms: number;
  size?: number | null;
  images: string[];
  propertyId: string;
  property?: Property;
  tenants?: Tenant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone: string;
  idNumber?: string | null;
  kraPin?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  moveInDate?: Date | null;
  moveOutDate?: Date | null;
  isActive: boolean;
  unitId?: string | null;
  unit?: Unit;
  userId?: string | null;
  user?: User;
  lease?: Lease;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lease {
  id: string;
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  depositAmount: number;
  terms?: string | null;
  status: LeaseStatus;
  isDigitalSignature: boolean;
  signedDocumentUrl?: string | null;
  tenantId: string;
  tenant?: Tenant;
  unitId: string;
  unit?: Unit;
  createdById: string;
  createdBy?: User;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  amount: number;
  description?: string | null;
  status: PaymentStatus;
  method: PaymentMethod;
  transactionCode?: string | null;
  receiptNumber?: string | null;
  paymentDate: Date;
  isPartial: boolean;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  qrCodeUrl?: string | null;
  tenantId: string;
  tenant?: Tenant;
  unitId: string;
  unit?: Unit;
  recordedById: string;
  recordedBy?: User;
  invoiceId?: string | null;
  invoice?: Invoice;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  month: number;
  year: number;
  rentAmount: number;
  waterCharge: number;
  electricityCharge: number;
  garbageCharge: number;
  serviceCharge: number;
  internetCharge: number;
  parkingCharge: number;
  otherCharges: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  dueDate: Date;
  status: InvoiceStatus;
  notes?: string | null;
  pdfUrl?: string | null;
  tenantId: string;
  tenant?: Tenant;
  unitId: string;
  unit?: Unit;
  createdById: string;
  createdBy?: User;
  payments?: Payment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: MaintenanceStatus;
  images: string[];
  estimatedCost?: number | null;
  actualCost?: number | null;
  scheduledDate?: Date | null;
  completedDate?: Date | null;
  notes?: string | null;
  tenantId: string;
  tenant?: Tenant;
  unitId: string;
  unit?: Unit;
  reportedById: string;
  reportedBy?: User;
  assignedToId?: string | null;
  assignedTo?: User;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: Date | null;
  sentViaEmail: boolean;
  sentViaSms: boolean;
  sentViaWhatsApp: boolean;
  userId: string;
  createdAt: Date;
}

// ============ DASHBOARD TYPES ============

export interface DashboardStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  totalTenants: number;
  monthlyRevenue: number;
  outstandingBalances: number;
  occupancyRate: number;
  expectedIncome: number;
  maintenanceExpenses: number;
  pendingMaintenance: number;
  recentPayments: Payment[];
  rentCollectionTrend: { month: string; amount: number }[];
  incomeVsExpenses: { month: string; income: number; expenses: number }[];
  propertyOccupancy: { name: string; occupied: number; vacant: number }[];
  recentActivities: ActivityLog[];
}

export interface ActivityLog {
  id: string;
  action: string;
  description?: string | null;
  entityType: string;
  entityId?: string | null;
  userId: string;
  user?: User;
  createdAt: Date;
}

// ============ FORM TYPES ============

export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
}

export interface PropertyForm {
  name: string;
  description?: string;
  type: PropertyType;
  address: string;
  city: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  images?: string[];
}

export interface UnitForm {
  unitNumber: string;
  description?: string;
  floorNumber?: number;
  monthlyRent: number;
  depositAmount: number;
  utilityCharges: number;
  waterCharge: number;
  electricityCharge: number;
  garbageCharge: number;
  serviceCharge: number;
  internetCharge: number;
  parkingCharge: number;
  bedrooms: number;
  bathrooms: number;
  size?: number;
  images?: string[];
  propertyId: string;
}

export interface TenantForm {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  idNumber?: string;
  kraPin?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  unitId?: string;
}

export interface PaymentForm {
  amount: number;
  method: PaymentMethod;
  description?: string;
  tenantId: string;
  unitId: string;
  invoiceId?: string;
  transactionCode?: string;
}

export interface MaintenanceForm {
  title: string;
  description: string;
  priority: string;
  unitId: string;
  images?: string[];
}

export interface LeaseForm {
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  depositAmount: number;
  terms?: string;
  tenantId: string;
  unitId: string;
}

// ============ RESPONSE TYPES ============

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// ============ CONSTANTS ============

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  [PropertyType.APARTMENT]: 'Apartment',
  [PropertyType.BEDSITTER]: 'Bedsitter',
  [PropertyType.SINGLE_ROOM]: 'Single Room',
  [PropertyType.MAISONETTE]: 'Maisonette',
  [PropertyType.COMMERCIAL]: 'Commercial Space',
  [PropertyType.VILLA]: 'Villa',
  [PropertyType.TOWNHOUSE]: 'Townhouse',
};

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  [UnitStatus.OCCUPIED]: 'Occupied',
  [UnitStatus.VACANT]: 'Vacant',
  [UnitStatus.UNDER_MAINTENANCE]: 'Under Maintenance',
  [UnitStatus.RESERVED]: 'Reserved',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.MPESA_STK_PUSH]: 'M-Pesa STK Push',
  [PaymentMethod.MPESA_PAYBILL]: 'M-Pesa Paybill',
  [PaymentMethod.MPESA_TILL_NUMBER]: 'M-Pesa Till Number',
  [PaymentMethod.BANK_TRANSFER]: 'Bank Transfer',
  [PaymentMethod.CASH]: 'Cash',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Draft',
  [InvoiceStatus.SENT]: 'Sent',
  [InvoiceStatus.PAID]: 'Paid',
  [InvoiceStatus.OVERDUE]: 'Overdue',
  [InvoiceStatus.CANCELLED]: 'Cancelled',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  [MaintenanceStatus.REPORTED]: 'Reported',
  [MaintenanceStatus.ASSIGNED]: 'Assigned',
  [MaintenanceStatus.IN_PROGRESS]: 'In Progress',
  [MaintenanceStatus.COMPLETED]: 'Completed',
  [MaintenanceStatus.CANCELLED]: 'Cancelled',
};

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  [LeaseStatus.ACTIVE]: 'Active',
  [LeaseStatus.EXPIRED]: 'Expired',
  [LeaseStatus.TERMINATED]: 'Terminated',
  [LeaseStatus.RENEWED]: 'Renewed',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.LANDLORD]: 'Landlord',
  [UserRole.MANAGER]: 'Property Manager',
  [UserRole.CARETAKER]: 'Caretaker',
  [UserRole.TENANT]: 'Tenant',
};

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS_SWAHILI = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
];
