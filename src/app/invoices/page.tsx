'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  FileText, Search, AlertCircle, RefreshCw, Inbox, Plus,
  CreditCard, Send, Phone, Mail, ExternalLink, CheckCircle2, RefreshCw as RefreshCwIcon,
  DoorOpen, Home, MessageSquare,
} from 'lucide-react';
import { SendMailModal } from '@/components/ui/send-mail-modal';
import { useStkWait } from '@/hooks/useStkWait';
import { Smartphone as SmartphoneIcon } from 'lucide-react';
import { buildPayLinkUrl, getPayLinkUrl } from '@/lib/payments/pay-link';
import { isValidSafaricomPhoneNumber } from '@/lib/payments/phone';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  month: number;
  year: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
  tenant?: { firstName: string; lastName: string } | null;
  unit?: { unitNumber: string } | null;
  createdBy?: { firstName: string; lastName: string; role: string } | null;
}

interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
  unitId: string | null;
  unit?: { unitNumber: string; property?: { name: string } } | null;
}

interface RoomContext {
  id: string;
  unitNumber: string;
  property?: { id: string; name: string } | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Hosted PalPluss checkout (NEXT_PUBLIC so it's available in the browser).
const PAY_LINK_URL = getPayLinkUrl();

/** Opens the hosted PalPluss checkout with the invoice balance prefilled. */
function openPayLink(balance: number, reference?: string) {
  const url = buildPayLinkUrl(balance, reference);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

const EMPTY_NEW_INVOICE = {
  tenantId: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  rentAmount: '',
  waterCharge: '0',
  electricityCharge: '0',
  garbageCharge: '0',
  serviceCharge: '0',
  internetCharge: '0',
  parkingCharge: '0',
  otherCharges: '0',
  dueDate: '',
  notes: '',
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD);
  const isTenant = user?.role === UserRole.TENANT;
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [stats, setStats] = useState({ outstanding: 0, count: 0, overdueCount: 0 });
  const [room, setRoom] = useState<RoomContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Pay Now modal
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);
  const [payPhone, setPayPhone] = useState('');
  const [paying, setPaying] = useState(false);
  // "Waiting for M-Pesa PIN" state: holds the modal open with a live 60s
  // countdown while the tenant enters their PIN, and long-polls until the
  // provider callback finalizes the payment (or the minute elapses).
  const stkWait = useStkWait();

  // "Waiting on the PalPluss checkout tab" state for pay-link payments: the
  // modal switches to a pending view and polls /api/payments/sync-link (plus
  // the payment status endpoint) until the webhook or the sync reconciliation
  // confirms the payment, or the tenant dismisses the wait.
  const [linkWait, setLinkWait] = useState<{ paymentId: string; reference: string } | null>(null);
  const [linkDone, setLinkDone] = useState<{ ok: boolean; code?: string | null } | null>(null);

  // New Invoice modal (management)
  const [mailOpen, setMailOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW_INVOICE);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load invoices');
      setInvoices(result.data);
      setStats(result.stats);
      // Tenant: also fetch room context so the page shows which room these invoices are for.
      if (!isManagement) {
        try {
          const roomRes = await fetch('/api/my-room');
          const roomResult = await roomRes.json();
          if (roomRes.ok && roomResult.success && roomResult.data?.unit) {
            setRoom({
              id: roomResult.data.unit.id,
              unitNumber: roomResult.data.unit.unitNumber,
              property: roomResult.data.unit.property || null,
            });
          }
        } catch {
          // Room context is optional for the invoices page.
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants');
      const result = await res.json();
      if (res.ok && result.success) setTenants(result.data || []);
    } catch {
      // tenants list is optional for the modal
    }
  }, []);

  const openNewModal = () => {
    fetchTenants();
    setForm(EMPTY_NEW_INVOICE);
    setNewOpen(true);
  };

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      `${inv.tenant?.firstName} ${inv.tenant?.lastName}`.toLowerCase().includes(q)
    );
  });

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payInvoice) return;
    setPaying(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: payInvoice.id, phoneNumber: payPhone || undefined }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Payment failed');
      if (result.data.status === 'PENDING') {
        // STK push accepted — keep the modal open and wait up to 1 minute for
        // the tenant to enter their PIN (resolved by the provider callback).
        toast.success(result.data.message || 'Payment prompt sent');
        setPaying(false);
        stkWait.start(result.data.paymentId);
        return;
      }
      toast.success(result.data.message || 'Payment successful');
      setPayInvoice(null);
      setPayPhone('');
      await fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  // Called when the 1-minute PIN wait ends (completed / failed / timeout).
  const handleStkWaitDone = useCallback(async () => {
    setPayInvoice(null);
    setPayPhone('');
    stkWait.reset();
    await fetchInvoices();
  }, [stkWait, fetchInvoices]);

  // React to the wait result once it resolves (completed / failed / timeout).
  useEffect(() => {
    if (stkWait.phase === 'completed') {
      toast.success(
        stkWait.transactionCode
          ? `Payment received — receipt ${stkWait.transactionCode}`
          : 'Payment received successfully'
      );
      handleStkWaitDone();
    } else if (stkWait.phase === 'failed') {
      toast.error('The M-Pesa payment was not completed. Please try again.');
      handleStkWaitDone();
    } else if (stkWait.phase === 'timeout') {
      toast.error(
        "We didn't receive your PIN within 1 minute — the payment is still pending. Re-enter your PIN on your phone or try again."
      );
      handleStkWaitDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stkWait.phase]);

  // Hosted-link path: create the PENDING payment record first (so the PalPluss
  // webhook or the sync-link reconciliation can match it), then open the
  // checkout page in a new tab and keep a waiting view until it's confirmed.
  const handlePayViaLink = async () => {
    if (!payInvoice || !PAY_LINK_URL) return;
    if (payPhone.trim() && !isValidSafaricomPhoneNumber(payPhone.trim())) {
      toast.error('Enter a valid Safaricom number (07… or 2547…) — your payment is matched by this number');
      return;
    }
    setPaying(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: payInvoice.id,
          phoneNumber: payPhone || undefined,
          payViaLink: true,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Payment failed');
      toast.success(result.data.message || 'Opening secure payment link...');
      openPayLink(payInvoice.balance, payInvoice.invoiceNumber);
      setLinkWait({ paymentId: result.data.paymentId, reference: payInvoice.invoiceNumber });
      setPayInvoice(null);
      setPayPhone('');
      await fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  // Polls while the tenant is on the checkout tab: the sync endpoint asks
  // PalPluss for a matching transaction (webhook fallback) and the status
  // endpoint resolves the moment anything finalizes the record.
  useEffect(() => {
    if (!linkWait || linkDone) return;
    let cancelled = false;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const [syncRes, statusRes] = await Promise.allSettled([
          fetch('/api/payments/sync-link', { signal: controller.signal, cache: 'no-store' }),
          fetch(`/api/payments/${linkWait.paymentId}/status`, { signal: controller.signal, cache: 'no-store' }),
        ]);
        if (cancelled) return;
        let finished: { ok: boolean; code?: string | null } | null = null;
        if (syncRes.status === 'fulfilled' && syncRes.value.ok) {
          const result = await syncRes.value.json().catch(() => null);
          if (result?.synced) finished = { ok: true, code: result.data?.transactionCode };
        }
        if (!finished && statusRes.status === 'fulfilled' && statusRes.value.ok) {
          const result = await statusRes.value.json().catch(() => null);
          const status = result?.data?.status;
          if (status === 'COMPLETED' || status === 'PARTIAL') {
            finished = { ok: true, code: result.data?.transactionCode || result.data?.receiptNumber };
          } else if (status && status !== 'PENDING') {
            finished = { ok: false };
          }
        }
        if (finished) {
          setLinkDone(finished);
          await fetchInvoices();
        }
      } catch {
        // transient network error — retry on the next tick
      }
    };
    tick();
    const interval = setInterval(tick, 4_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [linkWait, linkDone, fetchInvoices]);

  // Close the link-wait overlay once the payment resolves.
  const dismissLinkWait = useCallback(() => {
    setLinkWait(null);
    setLinkDone(null);
  }, []);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Tenants send no tenantId — the server derives it from their account.
          tenantId: form.tenantId || undefined,
          month: Number(form.month),
          year: Number(form.year),
          rentAmount: Number(form.rentAmount) || 0,
          waterCharge: Number(form.waterCharge) || 0,
          electricityCharge: Number(form.electricityCharge) || 0,
          garbageCharge: Number(form.garbageCharge) || 0,
          serviceCharge: Number(form.serviceCharge) || 0,
          internetCharge: Number(form.internetCharge) || 0,
          parkingCharge: Number(form.parkingCharge) || 0,
          otherCharges: Number(form.otherCharges) || 0,
          dueDate: form.dueDate,
          notes: form.notes || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to create invoice');
      toast.success('Invoice sent to tenant');
      setNewOpen(false);
      await fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const setFormField = (key: keyof typeof EMPTY_NEW_INVOICE, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const tenantOptions = tenants.map((t) => ({
    value: t.id,
    label: `${t.firstName} ${t.lastName} — Unit ${t.unit?.unitNumber || 'N/A'}`,
  }));

  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i)
    .map((y) => ({ value: String(y), label: String(y) }));

  const summary = [
    {
      label: isManagement ? 'Outstanding Total' : 'Amount Outstanding',
      value: formatCurrency(stats.outstanding),
      icon: AlertCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    { label: 'Invoices', value: stats.count, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Overdue', value: stats.overdueCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
            <p className="text-gray-500 mt-1">
              {isManagement ? 'Send invoices to your tenants' : 'Your rent invoices — pay with M-Pesa'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMailOpen(true)} className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Send Message
            </Button>
            <button
              onClick={fetchInvoices}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {isManagement ? (
              <Button className="gap-2" onClick={openNewModal}>
                <Plus className="w-4 h-4" />
                New Invoice
              </Button>
            ) : (
              <Button variant="outline" className="gap-2" onClick={openNewModal}>
                <Send className="w-4 h-4" />
                Send Invoice to Landlord
              </Button>
            )}
          </div>
        </div>

        {/* Tenant: Your Room context — same pattern as My Room */}
        {isTenant && room && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100">
                  <DoorOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Your room: {room.unitNumber}
                  </p>
                  <p className="text-xs text-gray-500">
                    {room.property?.name || 'Your property'} — invoices for your room
                  </p>
                </div>
              </div>
              <Link href="/my-room">
                <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap">
                  View My Room
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Tenant: No room allocated */}
        {isTenant && !room && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100">
                <Home className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">No room allocated yet</p>
                <p className="text-xs text-gray-500">
                  Your landlord has not allocated you a room. Once they do, your invoices will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
            placeholder="Search invoice number or tenant..."
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
              <p>{search ? 'No invoices match your search' : 'No invoices yet'}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Invoice</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Period</th>
                      {isManagement && <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Tenant</th>}
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Due Date</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Total</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Balance</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.invoiceNumber}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {MONTH_NAMES[inv.month - 1]} {inv.year}
                        </td>
                        {isManagement && (
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {inv.tenant?.firstName} {inv.tenant?.lastName || '—'}
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.dueDate)}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">{formatCurrency(inv.totalAmount)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">{formatCurrency(inv.balance)}</td>
                        <td className="px-6 py-4">
                          <Badge variant={STATUS_VARIANTS[inv.status] || 'default'}>{inv.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!isManagement && inv.balance > 0 && (
                            <Button size="sm" className="gap-1.5" onClick={() => setPayInvoice(inv)}>
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay Now
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pay Now Modal */}
      <Modal
        open={!!payInvoice || stkWait.phase === 'waiting'}
        onClose={() => {
          // While waiting for the PIN, closing dismisses the wait (the payment
          // itself stays PENDING and can still complete via the callback).
          if (stkWait.phase === 'waiting') stkWait.reset();
          setPayInvoice(null);
        }}
        title={
          stkWait.phase === 'waiting'
            ? 'Waiting for your M-Pesa PIN'
            : `Pay ${payInvoice?.invoiceNumber || ''}`
        }
        subtitle={
          stkWait.phase === 'waiting'
            ? undefined
            : `Balance: ${payInvoice ? formatCurrency(payInvoice.balance) : ''}`
        }
      >
        {stkWait.phase === 'waiting' ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <SmartphoneIcon className="h-7 w-7 text-emerald-600 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              Check your phone — enter your M-Pesa PIN to complete the payment
            </p>
            <p className="text-xs text-[#646669]">
              A PIN prompt was sent to <strong>{payPhone || 'your number'}</strong>. The request
              expires after 1 minute — you can retry after that.
            </p>
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500 text-xl font-bold text-emerald-600"
              role="timer"
              aria-live="polite"
            >
              {stkWait.secondsLeft}
            </div>
            <p className="text-xs text-[#646669]">Waiting for confirmation…</p>
          </div>
        ) : (
        <form onSubmit={handlePay} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Amount <span className="text-red-500 ml-1">*</span>
            </label>
            <Input
              name="amount"
              value={payInvoice ? formatCurrency(payInvoice.balance) : ''}
              readOnly
              className="font-semibold"
            />
          </div>
          <Input
            name="phoneNumber"
            label="M-Pesa Phone Number"
            placeholder="e.g. 0712345678"
            value={payPhone}
            onChange={(e) => setPayPhone(e.target.value)}
            icon={<Phone className="w-4 h-4" />}
            required
          />
          <p className="text-xs text-[#646669]">
            An M-Pesa STK push will be sent to this number. If you use the payment link, any
            M-Pesa number can pay at checkout — just enter the same number you typed above so
            your payment is matched automatically.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setPayInvoice(null)}>
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
                <ExternalLink className="w-4 h-4" />
                Pay via Link
              </Button>
            )}
            <Button type="submit" loading={paying}>
              <Send className="w-4 h-4 mr-2" />
              Pay Now
            </Button>
          </div>
        </form>
        )}
      </Modal>

      {/* Waiting-for-checkout overlay while the tenant pays on the PalPluss tab */}
      <Modal
        open={!!linkWait}
        onClose={dismissLinkWait}
        title="Complete your payment"
        subtitle="A secure PalPluss checkout was opened in a new tab"
      >
        {linkDone ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className={`h-7 w-7 ${linkDone.ok ? 'text-emerald-600' : 'text-red-500'}`} />
            </div>
            <p className="text-sm font-medium text-gray-900">
              {linkDone.ok ? 'Payment received successfully' : 'The payment was not completed'}
            </p>
            {linkDone.ok && linkDone.code && (
              <p className="text-xs text-[#646669]">Receipt: {linkDone.code}</p>
            )}
            {!linkDone.ok && (
              <p className="text-xs text-[#646669]">
                You can close the checkout tab and try again.
              </p>
            )}
            <Button onClick={dismissLinkWait} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <ExternalLink className="h-7 w-7 text-blue-600 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              Finish the payment on the checkout tab
            </p>
            <p className="text-xs text-[#646669]">
              Enter your M-Pesa PIN there using the number <strong>{payPhone || 'you registered'}</strong> —
              this page updates automatically once your payment lands. Amount and reference
              {linkWait?.reference ? ` (${linkWait.reference})` : ''} were prefilled.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#646669]">
              <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
              Waiting for confirmation…
            </div>
            <Button variant="outline" onClick={dismissLinkWait} className="w-full">
              Close and check invoices later
            </Button>
          </div>
        )}
      </Modal>

      {/* New Invoice Modal (management) */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={isManagement ? 'New Invoice' : 'Send Invoice to Landlord'}
        subtitle={isManagement ? 'Send an invoice to a tenant' : 'Raise an invoice that is sent to your landlord'}
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          {isManagement && (
            <Select
              name="tenantId"
              label="Tenant"
              placeholder="Select a tenant"
              options={tenantOptions}
              required
              value={form.tenantId}
              onChange={(e) => setFormField('tenantId', e.target.value)}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Select
              name="month"
              label="Month"
              options={monthOptions}
              value={form.month}
              onChange={(e) => setFormField('month', e.target.value)}
            />
            <Select
              name="year"
              label="Year"
              options={yearOptions}
              value={form.year}
              onChange={(e) => setFormField('year', e.target.value)}
            />
          </div>
          <Input
            name="rentAmount"
            label="Rent Amount (KES)"
            type="number"
            placeholder="e.g. 45000"
            required
            value={form.rentAmount}
            onChange={(e) => setFormField('rentAmount', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              name="waterCharge"
              label="Water (KES)"
              type="number"
              value={form.waterCharge}
              onChange={(e) => setFormField('waterCharge', e.target.value)}
            />
            <Input
              name="electricityCharge"
              label="Electricity (KES)"
              type="number"
              value={form.electricityCharge}
              onChange={(e) => setFormField('electricityCharge', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              name="garbageCharge"
              label="Garbage (KES)"
              type="number"
              value={form.garbageCharge}
              onChange={(e) => setFormField('garbageCharge', e.target.value)}
            />
            <Input
              name="serviceCharge"
              label="Service (KES)"
              type="number"
              value={form.serviceCharge}
              onChange={(e) => setFormField('serviceCharge', e.target.value)}
            />
          </div>
          <Input
            name="dueDate"
            label="Due Date"
            type="date"
            required
            value={form.dueDate}
            onChange={(e) => setFormField('dueDate', e.target.value)}
          />
          <Input
            name="notes"
            label="Notes (optional)"
            placeholder="e.g. includes water bill for May"
            value={form.notes}
            onChange={(e) => setFormField('notes', e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              <Send className="w-4 h-4 mr-2" />
              {isManagement ? 'Send Invoice' : 'Send to Landlord'}
            </Button>
          </div>
        </form>
      </Modal>
      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
