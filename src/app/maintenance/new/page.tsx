'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { ArrowLeft, Send, Wrench, DoorOpen, Users } from 'lucide-react';

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

interface UnitOption {
  id: string;
  unitNumber: string;
  property?: { name?: string } | null;
  tenants?: { firstName: string; lastName: string }[];
}

/**
 * Full-page "New Request" form — the button the dashboard links to.
 * Both the tenant and the landlord/manager raise requests here; whichever
 * side submits it, the counterpart sees it on the Maintenance list.
 */
export default function NewRequestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD);

  const [submitting, setSubmitting] = useState(false);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsLoaded, setUnitsLoaded] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', unitId: '' });

  // Management picks which room the request is about so the tenant of that
  // room sees it on their side too.
  useEffect(() => {
    if (!isManagement || unitsLoaded) return;
    (async () => {
      try {
        const res = await fetch('/api/units');
        const result = await res.json();
        if (res.ok && result.success) setUnits(result.data || []);
      } catch {
        // Unit picker is optional — the request can still be raised estate-wide.
      } finally {
        setUnitsLoaded(true);
      }
    })();
  }, [isManagement, unitsLoaded]);

  const unitOptions = units.map((u) => ({
    value: u.id,
    label: `${u.property?.name ? `${u.property.name} • ` : ''}Unit ${u.unitNumber}${
      u.tenants && u.tenants.length > 0
        ? ` — ${u.tenants.map((t) => `${t.firstName} ${t.lastName}`).join(', ')}`
        : ''
    }`,
  }));

  const handleChange = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, string> = {
        title: form.title,
        description: form.description,
        priority: form.priority,
      };
      if (isManagement && form.unitId) payload.unitId = form.unitId;

      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to submit request');

      toast.success('Request submitted — your counterpart has been notified');
      router.push('/maintenance');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request');
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/maintenance"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-all duration-200"
            aria-label="Back to requests"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Request</h1>
            <p className="text-gray-500 mt-1">
              {isManagement
                ? 'Raise a request for a room — the tenant will see it on their dashboard'
                : 'Send a request to your landlord — they will see it on their dashboard'}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                name="title"
                label="Title"
                placeholder="e.g. Leaking kitchen sink, rent receipt request"
                required
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  Description <span className="text-red-500 ml-1">*</span>
                </label>
                <textarea
                  name="description"
                  required
                  rows={5}
                  placeholder="Describe the request in detail..."
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e2b714] focus-visible:border-transparent transition-all duration-200"
                />
              </div>

              <Select
                name="priority"
                label="Priority"
                options={PRIORITY_OPTIONS}
                value={form.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
              />

              {isManagement && (
                <Select
                  name="unitId"
                  label="For which room?"
                  placeholder={unitsLoaded ? 'Estate-wide (no specific room)' : 'Loading rooms...'}
                  options={unitOptions}
                  value={form.unitId}
                  onChange={(e) => handleChange('unitId', e.target.value)}
                />
              )}

              {/* Context card so each side knows who will receive this. */}
              <div
                className={`flex items-start gap-3 p-4 rounded-xl border ${
                  isManagement ? 'border-blue-200 bg-blue-50/60' : 'border-emerald-200 bg-emerald-50/60'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    isManagement ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                  }`}
                >
                  {isManagement ? <Users className="w-4 h-4" /> : <DoorOpen className="w-4 h-4" />}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-gray-900">
                    {isManagement
                      ? form.unitId
                        ? 'This request goes to the tenant of that room'
                        : 'This is an estate-wide request'
                      : 'This request goes to your landlord'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    They will be notified in-app and can track or update it from their dashboard.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Visible to both you and your counterpart</span>
                </div>
                <div className="flex gap-2">
                  <Link href="/maintenance">
                    <Button type="button" variant="ghost">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" loading={submitting} className="gap-2">
                    <Send className="w-4 h-4" />
                    Submit Request
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
