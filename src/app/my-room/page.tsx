'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { normalizeUnitStatus } from '@/lib/utils/room-assignment';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  DoorOpen, Home, Landmark, Phone, Mail, Wallet, Plus, RefreshCw,
  Inbox, CheckCircle2, UserCog, Smartphone, Send,
} from 'lucide-react';
import { SendMailModal } from '@/components/ui/send-mail-modal';
import {
  hasPaymentDetails,
  formatPaymentInstructions,
} from '@/lib/utils/payment-details';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}

interface RoomPayment {
  id: string;
  amount: number;
  status: string;
  method: string;
  description?: string | null;
  transactionCode?: string | null;
  receiptNumber?: string | null;
  paymentDate: string;
}interface MyRoomData {
  tenant: { id: string; firstName: string; lastName: string; phone?: string | null; email?: string | null };
  unit: {
    id: string;
    unitNumber: string;
    description?: string | null;
    floorNumber?: number | null;
    status: string;
    monthlyRent: number;
    depositAmount: number;
    bedrooms: number;
    bathrooms: number;
    size?: number | null;
    waterCharge: number;
    electricityCharge: number;
    garbageCharge: number;
    serviceCharge: number;
    internetCharge: number;
    parkingCharge: number;
    property?: { id: string; name: string; address: string; city: string; state?: string | null } | null;
  } | null;
  paymentDetails?: {
    mpesaPaybill?: string | null;
    mpesaAccountName?: string | null;
    mpesaTillNumber?: string | null;
    mpesaPhone?: string | null;
  } | null;
  landlord: Person | null;
  caretakers: Person[];
  lease: { startDate: string; endDate: string; monthlyRent: number; status: string } | null;
  payments: RoomPayment[];
  summary: { outstanding: number; totalPaid: number; entryCount: number };
}

const METHOD_LABELS: Record<string, string> = {
  MPESA_STK_PUSH: 'M-Pesa STK Push',
  MPESA_PAYBILL: 'M-Pesa Paybill',
  MPESA_TILL_NUMBER: 'M-Pesa Till',
  BANK_TRANSFER: 'Bank Transfer',
  CASH: 'Cash',
};

function monthlyCharges(unit: NonNullable<MyRoomData['unit']>) {
  return (
    unit.waterCharge +
    unit.electricityCharge +
    unit.garbageCharge +
    unit.serviceCharge +
    unit.internetCharge +
    unit.parkingCharge
  );
}

export default function MyRoomPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isTenant = user?.role === UserRole.TENANT;
  const [data, setData] = useState<MyRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState(false);

  const fetchRoom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/my-room');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load your room');
      setData(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your room');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTenant) fetchRoom();
  }, [isTenant, fetchRoom]);

  if (!user) {
    return (
      <DashboardLayout>
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (!isTenant) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="p-12 text-center text-gray-400">
            <DoorOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>This section is for tenants. Ask your landlord for the room you have been allocated.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const unit = data?.unit ?? null;
  const charges = unit ? monthlyCharges(unit) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Room</h1>
            <p className="text-gray-500 mt-1">
              The room your landlord allocated to you — and only that room.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMailOpen(true)} className="gap-2">
              <Mail className="w-4 h-4" />
              Send Mail
            </Button>
            <button
              onClick={fetchRoom}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {unit && (
              <Link href="/payments">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Make Payment
                </Button>
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : !unit ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <Home className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-gray-600">No room allocated yet</p>
              <p className="text-sm mt-1">
                Your landlord has not allocated you a room. Once they do, it will appear here and you
                can start paying for it.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Room + balance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-50">
                        <DoorOpen className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">Room {unit.unitNumber}</p>
                        <p className="text-sm text-gray-500">
                          {unit.property?.name || 'Property'}
                          {unit.property?.city ? ` • ${unit.property.city}` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANTS[normalizeUnitStatus(unit.status)] || 'default'}>
                      {normalizeUnitStatus(unit.status).replace(/_/g, ' ')}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div>
                      <p className="text-xs text-gray-500">Monthly Rent</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(unit.monthlyRent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Other Charges</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(charges)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Deposit</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(unit.depositAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Bed / Bath</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {unit.bedrooms} / {unit.bathrooms}
                      </p>
                    </div>
                  </div>

                  {unit.property && (
                    <p className="text-xs text-gray-400 mt-4">
                      {unit.property.address}, {unit.property.city}
                      {unit.property.state ? `, ${unit.property.state}` : ''}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500">Amount Due</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {formatCurrency(data!.summary.outstanding)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {data!.summary.entryCount === 0
                      ? 'Nothing recorded for this room yet — it starts at KES 0.'
                      : 'Balance on your room.'}
                  </p>
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Total Paid</p>
                        <p className="text-sm font-semibold text-emerald-600">
                          {formatCurrency(data!.summary.totalPaid)}
                        </p>
                      </div>
                    </div>
                    {hasPaymentDetails(data!.paymentDetails) ? (
                      <Button size="sm" className="gap-1.5 w-full mt-4" onClick={() => router.push('/payments')}>
                        <Smartphone className="w-3.5 h-3.5" />
                        Pay — Get M-Pesa Prompt
                      </Button>
                    ) : (
                      <Link href="/payments" className="block">
                        <Button size="sm" className="gap-1.5 w-full mt-4">
                          <Wallet className="w-3.5 h-3.5" />
                          Pay Rent
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* How to Pay — the landlord's exact collection details */}
            {hasPaymentDetails(data!.paymentDetails) && (
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-50">
                      <Smartphone className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">How to Pay Rent</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Your landlord receives rent at exactly these details. When you tap Pay, the
                        M-Pesa prompt is sent to your phone — just enter your PIN. No paybill entry
                        needed.
                      </p>
                      <ul className="mt-3 space-y-1">
                        {formatPaymentInstructions(data!.paymentDetails).map((line) => (
                          <li key={line} className="text-sm text-gray-700 flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Landlord + caretaker */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Landmark className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-900">Landlord</p>
                  </div>
                  {data!.landlord ? (
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-700">
                        {data!.landlord.firstName} {data!.landlord.lastName}
                      </p>
                      {data!.landlord.phone && (
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" /> {data!.landlord.phone}
                        </p>
                      )}
                      {data!.landlord.email && (
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> {data!.landlord.email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Not available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCog className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-900">Caretaker</p>
                  </div>
                  {data!.caretakers.length > 0 ? (
                    <div className="space-y-3">
                      {data!.caretakers.map((c) => (
                        <div key={c.id} className="space-y-1">
                          <p className="text-sm text-gray-700">
                            {c.firstName} {c.lastName}
                          </p>
                          {c.phone && (
                            <p className="text-xs text-gray-500 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5" /> {c.phone}
                            </p>
                          )}
                          {c.email && (
                            <p className="text-xs text-gray-500 flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5" /> {c.email}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Not available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-900">My Tenancy</p>
                  </div>
                  {data!.lease ? (
                    <div className="space-y-1.5 text-xs text-gray-500">
                      <p>
                        Status: <span className="text-gray-700 font-medium">{data!.lease.status}</span>
                      </p>
                      <p>From {formatDate(data!.lease.startDate)}</p>
                      <p>To {formatDate(data!.lease.endDate)}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">
                      {data!.tenant.firstName} {data!.tenant.lastName} — allocated to Room {unit.unitNumber}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Own transactions only */}
            <Card>
              <CardContent className="p-0">
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">My payments for this room</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Only transactions made by you appear here.
                  </p>
                </div>
                {data!.payments.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No transactions yet</p>
                    <p className="text-xs mt-1">Your room is at KES 0 until you make a payment.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Date</th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Method</th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Reference</th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data!.payments.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-600">{formatDate(p.paymentDate)}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {METHOD_LABELS[p.method] || p.method.replace(/_/g, ' ')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {p.transactionCode || p.receiptNumber || '—'}
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={STATUS_VARIANTS[p.status] || 'default'}>
                                {p.status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
