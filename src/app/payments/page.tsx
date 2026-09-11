'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  Wallet, Search, CheckCircle2, Clock, RefreshCw, Inbox, Plus, Receipt,
  Send, Phone, CreditCard, Banknote,
} from 'lucide-react';

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

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  balance: number;
  totalAmount: number;
  month: number;
  year: number;
  dueDate: string;
}

interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
  unit?: { unitNumber: string; property?: { name: string } } | null;
}

const METHOD_LABELS: Record<string, string> = {
  MPESA_STK_PUSH: 'M-Pesa STK Push',
  MPESA_PAYBILL: 'M-Pesa Paybill',
  MPESA_TILL_NUMBER: 'M-Pesa Till',
  BANK_TRANSFER: 'Bank Transfer',
  CASH: 'Cash',
};

const METHOD_OPTIONS = Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Hosted PalPluss checkout (NEXT_PUBLIC so it's available in the browser).
const PAY_LINK_URL = process.env.NEXT_PUBLIC_PALPLUSS_PAY_LINK_URL;

/** Opens the hosted PalPluss checkout with the payment amount prefilled. */
function openPayLink(amount: number) {
  const url = `${PAY_LINK_URL}?amount=${Math.round(amount)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [stats, setStats] = useState({ totalPaid: 0, count: 0, pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Tenant "Make Payment" modal
  const [payOpen, setPayOpen] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [paying, setPaying] = useState(false);
  const [payForm, setPayForm] = useState({ invoiceId: '', amount: '', phone: '' });

  // Management "Record Payment" modal
  const [recordOpen, setRecordOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordForm, setRecordForm] = useState({ tenantId: '', amount: '', method: 'CASH', phone: '' });

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

  // ---- Realtime monitoring ----
  // Lightweight polling feed: watchers (landlord / manager / caretaker) get a
  // live view that refreshes every 10s and pops a toast when a payment lands.
  // Polling (not websockets) keeps this working on serverless deploys.
  const isWatcher = isManagement || user?.role === UserRole.CARETAKER;
  const knownPaymentIds = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef(false);

  useEffect(() => {
    if (!isWatcher) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/payments', { cache: 'no-store' });
        const result = await res.json();
        if (!res.ok || !result.success || cancelled) return;
        const fresh: PaymentRow[] = result.data || [];
        setPayments(fresh);
        setStats(result.stats);
        if (firstLoadDone.current) {
          for (const p of fresh) {
            if (!knownPaymentIds.current.has(p.id) && p.status === 'COMPLETED') {
              toast.success(
                `💰 ${p.tenant?.firstName || 'Tenant'} ${p.tenant?.lastName || ''} paid ${formatCurrency(p.amount)}` +
                  (p.unit?.unitNumber ? ` (Unit ${p.unit.unitNumber})` : ''),
                { duration: 6000 }
              );
            }
          }
        }
        knownPaymentIds.current = new Set(fresh.map((p) => p.id));
        firstLoadDone.current = true;
      } catch {
        // transient network error — retry on the next tick
      }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isWatcher]);

  // Open the tenant payment modal: load the tenant's unpaid invoices so they can
  // pay one of them OR make a direct payment without any invoice.
  const openPayModal = useCallback(async () => {
    setPayOpen(true);
    setPayForm({ invoiceId: '', amount: '', phone: user?.phone || '' });
    try {
      const res = await fetch('/api/invoices');
      const result = await res.json();
      if (res.ok && result.success) {
        setInvoices(
          (result.data || [])
            .filter((i: any) => i.balance > 0)
            .map((i: any) => ({
              id: i.id,
              invoiceNumber: i.invoiceNumber,
              balance: i.balance,
              totalAmount: i.totalAmount,
              month: i.month,
              year: i.year,
              dueDate: i.dueDate,
            }))
        );
      }
    } catch {
      // invoices are optional for a direct payment
    }
  }, [user?.phone]);

  // Prefill the amount when an invoice is picked (capped at its balance).
  const handleInvoiceChange = (value: string) => {
    setPayForm((f) => {
      const inv = invoices.find((i) => i.id === value);
      return { ...f, invoiceId: value, amount: inv ? String(inv.balance) : '' };
    });
  };

  // Tenant pays: POST /api/payments with an invoiceId (or a direct amount).
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaying(true);
    try {
      const amount = Number(payForm.amount);
      if (!amount || amount <= 0) throw new Error('Enter the amount to pay');
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: payForm.invoiceId || undefined,
          amount,
          phoneNumber: payForm.phone || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Payment failed');
      if (result.data.status === 'PENDING') {
        toast.success(result.data.message || 'Payment prompt sent');
      } else {
        toast.success(result.data.message || 'Payment successful');
      }
      setPayOpen(false);
      await fetchPayments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  // Tenant pays via the hosted PalPluss link (same API — payment matched by webhook).
  const handlePayViaLink = async () => {
    if (!PAY_LINK_URL) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Enter the amount to pay');
      return;
    }
    setPaying(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: payForm.invoiceId || undefined,
          amount,
          phoneNumber: payForm.phone || undefined,
          payViaLink: true,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Payment failed');
      toast.success(result.data.message || 'Opening secure payment link...');
      openPayLink(amount);
      setPayOpen(false);
      await fetchPayments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  // Open the management "Record Payment" modal: load tenants to pick from.
  const openRecordModal = useCallback(async () => {
    setRecordOpen(true);
    setRecordForm({ tenantId: '', amount: '', method: 'CASH', phone: '' });
    try {
      const res = await fetch('/api/tenants');
      const result = await res.json();
      if (res.ok && result.success) setTenants(result.data || []);
    } catch {
      // tenant list is required for recording — keep modal closed on failure
      toast.error('Could not load tenants');
      setRecordOpen(false);
    }
  }, []);

  // Management records a payment directly (cash / bank transfer / etc.).
  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecording(true);
    try {
      const amount = Number(recordForm.amount);
      if (!amount || amount <= 0) throw new Error('Enter the amount');
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: recordForm.tenantId,
          amount,
          method: recordForm.method,
          phoneNumber: recordForm.phone || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to record payment');
      toast.success(result.data.message || 'Payment recorded successfully');
      setRecordOpen(false);
      await fetchPayments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setRecording(false);
    }
  };

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

  // Leading "direct payment" option (value '') so tenants can switch back to
  // paying without an invoice after picking one.
  const invoiceOptions: { value: string; label: string }[] = [
    { value: '', label: 'No invoice — direct payment' },
    ...invoices.map((i) => ({
      value: i.id,
      label: `${i.invoiceNumber} — ${MONTH_NAMES[i.month - 1]} ${i.year} (${formatCurrency(i.balance)} due)`,
    })),
  ];

  const hasInvoices = invoices.length > 0;

  const tenantOptions = tenants.map((t) => ({
    value: t.id,
    label: `${t.firstName} ${t.lastName} — Unit ${t.unit?.unitNumber || 'N/A'}`,
  }));

  const selectedInvoice = invoices.find((i) => i.id === payForm.invoiceId);

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
            {isManagement ? (
              <Button className="gap-2" onClick={openRecordModal}>
                <Banknote className="w-4 h-4" />
                Record Payment
              </Button>
            ) : (
              <Button className="gap-2" onClick={openPayModal}>
                <Plus className="w-4 h-4" />
                Make Payment
              </Button>
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

      {/* Tenant Make Payment Modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Make a Payment"
        subtitle="Pay one of your invoices or make a direct rent payment"
      >
        <form onSubmit={handlePay} className="space-y-4">
          {hasInvoices ? (
            <Select
              name="invoiceId"
              label="Invoice (optional)"
              options={invoiceOptions}
              value={payForm.invoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
            />
          ) : (
            <div className="text-xs text-[#646669] bg-[#0f0f1a] border border-[#2a2a3e] rounded-lg px-3 py-2.5">
              No outstanding invoices — this will be recorded as a direct rent payment.
            </div>
          )}
          <Input
            name="amount"
            label="Amount (KES)"
            type="number"
            placeholder="e.g. 45000"
            required
            value={payForm.amount}
            onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
            icon={<Wallet className="w-4 h-4" />}
          />
          {selectedInvoice && (
            <p className="text-xs text-[#646669]">
              Invoice total {formatCurrency(selectedInvoice.totalAmount)} — balance {formatCurrency(selectedInvoice.balance)}.
              Paying less is treated as a partial payment.
            </p>
          )}
          <Input
            name="phoneNumber"
            label="M-Pesa Phone Number"
            placeholder="e.g. 0712345678"
            value={payForm.phone}
            onChange={(e) => setPayForm((f) => ({ ...f, phone: e.target.value }))}
            icon={<Phone className="w-4 h-4" />}
            required
          />
          <p className="text-xs text-[#646669]">
            An M-Pesa STK push will be sent to this number. In demo mode (no PalPluss API key) the
            payment is recorded instantly with a simulated transaction code.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            {PAY_LINK_URL && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={handlePayViaLink}
                loading={paying}
              >
                <CreditCard className="w-4 h-4" />
                Pay via Link
              </Button>
            )}
            <Button type="submit" loading={paying}>
              <Send className="w-4 h-4 mr-2" />
              Pay Now
            </Button>
          </div>
        </form>
      </Modal>

      {/* Management Record Payment Modal */}
      <Modal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        title="Record a Payment"
        subtitle="Cash, bank transfer or M-Pesa received outside the app"
      >
        <form onSubmit={handleRecord} className="space-y-4">
          <Select
            name="tenantId"
            label="Tenant"
            placeholder="Select a tenant"
            options={tenantOptions}
            required
            value={recordForm.tenantId}
            onChange={(e) => setRecordForm((f) => ({ ...f, tenantId: e.target.value }))}
          />
          <Input
            name="amount"
            label="Amount (KES)"
            type="number"
            placeholder="e.g. 45000"
            required
            value={recordForm.amount}
            onChange={(e) => setRecordForm((f) => ({ ...f, amount: e.target.value }))}
            icon={<Wallet className="w-4 h-4" />}
          />
          <Select
            name="method"
            label="Payment Method"
            options={METHOD_OPTIONS}
            value={recordForm.method}
            onChange={(e) => setRecordForm((f) => ({ ...f, method: e.target.value }))}
          />
          <Input
            name="phone"
            label="Phone (optional)"
            placeholder="e.g. 0712345678"
            value={recordForm.phone}
            onChange={(e) => setRecordForm((f) => ({ ...f, phone: e.target.value }))}
            icon={<Phone className="w-4 h-4" />}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={recording}>
              Record Payment
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
