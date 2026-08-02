'use client';

import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { Wallet, Search, CheckCircle2, Clock, RefreshCw, Inbox, Plus, Receipt } from 'lucide-react';
import Link from 'next/link';

interface PaymentRow {
  id: string;
  amount: number;
  description?: string | null;
  status: string;
  method: string;
  transactionCode?: string | null;
  receiptNumber?: string | null;
  paymentDate: string;
  tenant?: { firstName: string; lastName: string } | null;
  unit?: { unitNumber: string } | null;
  invoice?: { invoiceNumber: string } | null;
}

const METHOD_LABELS: Record<string, string> = {
  MPESA_STK_PUSH: 'M-Pesa STK Push',
  MPESA_PAYBILL: 'M-Pesa Paybill',
  MPESA_TILL_NUMBER: 'M-Pesa Till',
  BANK_TRANSFER: 'Bank Transfer',
  CASH: 'Cash',
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [stats, setStats] = useState({ totalPaid: 0, count: 0, pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payments');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load payments');
      setPayments(result.data);
      setStats(result.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const filtered = payments.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.transactionCode || '').toLowerCase().includes(q) ||
      (p.receiptNumber || '').toLowerCase().includes(q) ||
      (p.invoice?.invoiceNumber || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  });

  const summary = [
    {
      label: isManagement ? 'Total Collected' : 'Total Paid',
      value: formatCurrency(stats.totalPaid),
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    { label: 'Payments', value: stats.count, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Pending', value: stats.pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
            <p className="text-gray-500 mt-1">
              {isManagement ? 'All rent payments across the estate' : 'Your rent payment history'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPayments}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {!isManagement && (
              <Link href="/invoices">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Make Payment
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summary.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${s.bg}`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-xl font-bold text-gray-900">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="max-w-md">
          <Input
            name="search"
            placeholder="Search by receipt, transaction code, invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? 'No payments match your search' : 'No payments recorded yet'}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Date</th>
                      {isManagement && <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Tenant</th>}
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Unit</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Method</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Reference</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600">{formatDate(payment.paymentDate)}</td>
                        {isManagement && (
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">
                              {payment.tenant?.firstName} {payment.tenant?.lastName || '—'}
                            </p>
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm text-gray-600">{payment.unit?.unitNumber || '—'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{METHOD_LABELS[payment.method] || payment.method.replace(/_/g, ' ')}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <p className="text-sm text-gray-600">{payment.transactionCode || payment.receiptNumber || '—'}</p>
                          </div>
                          {payment.invoice && <p className="text-xs text-gray-400">{payment.invoice.invoiceNumber}</p>}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={STATUS_VARIANTS[payment.status] || 'default'}>{payment.status.replace(/_/g, ' ')}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
