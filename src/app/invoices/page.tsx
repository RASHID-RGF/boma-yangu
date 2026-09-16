'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
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
  CreditCard, Send, Phone, Mail,
} from 'lucide-react';
import { SendMailModal } from '@/components/ui/send-mail-modal';

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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Hosted PalPluss checkout (NEXT_PUBLIC so it's available in the browser).
const PAY_LINK_URL = process.env.NEXT_PUBLIC_PALPLUSS_PAY_LINK_URL;

/** Opens the hosted PalPluss checkout with the invoice balance prefilled. */
function openPayLink(balance: number) {
  const url = `${PAY_LINK_URL}?amount=${Math.round(balance)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
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
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [stats, setStats] = useState({ outstanding: 0, count: 0, overdueCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Pay Now modal
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);
  const [payPhone, setPayPhone] = useState('');
  const [paying, setPaying] = useState(false);

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
        toast.success(result.data.message || 'Payment prompt sent');
      } else {
        toast.success(result.data.message || 'Payment successful');
      }
      setPayInvoice(null);
      setPayPhone('');
      await fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  // Hosted-link path: create the PENDING payment record first (so the PalPluss
  // webhook can match it), then open the checkout page in a new tab.
  const handlePayViaLink = async () => {
    if (!payInvoice || !PAY_LINK_URL) return;
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
      openPayLink(payInvoice.balance);
      setPayInvoice(null);
      setPayPhone('');
      await fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

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
              <Mail className="w-4 h-4" />
              Send Mail
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
        open={!!payInvoice}
        onClose={() => setPayInvoice(null)}
        title={`Pay ${payInvoice?.invoiceNumber || ''}`}
        subtitle={`Balance: ${payInvoice ? formatCurrency(payInvoice.balance) : ''}`}
      >
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
            An M-Pesa STK push will be sent to this number. If you use the payment link, make sure
            you enter this same M-Pesa number at checkout so your payment is matched. In demo mode
            (no PalPluss API key) the payment is recorded instantly with a simulated transaction code.
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
