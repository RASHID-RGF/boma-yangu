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
import { formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { Wrench, Plus, RefreshCw, Inbox, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface MaintenanceRow {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  unit?: { unitNumber: string } | null;
  assignedTo?: { firstName: string; lastName: string } | null;
}

const PRIORITY_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  URGENT: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'info',
};

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const STATUS_OPTIONS = [
  { value: 'REPORTED', label: 'Reported' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function MaintenancePage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  // Both tenants and management can report issues.
  const canReport = true;
  const [requests, setRequests] = useState<MaintenanceRow[]>([]);
  const [stats, setStats] = useState({ openCount: 0, count: 0, urgentCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM' });

  // Management status updates: per-request draft status + busy state.
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/maintenance');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load requests');
      setRequests(result.data);
      setStats(result.stats);
      // Seed the status draft for each request so the dropdown matches reality.
      setStatusDrafts(Object.fromEntries(result.data.map((r: MaintenanceRow) => [r.id, r.status])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleChange = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to submit request');
      toast.success('Maintenance request submitted');
      setModalOpen(false);
      setForm({ title: '', description: '', priority: 'MEDIUM' });
      await fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  // Management: update the status of a request.
  const handleStatusUpdate = async (id: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDrafts[id] }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update status');
      toast.success(`Status updated to ${statusDrafts[id].replace(/_/g, ' ')}`);
      await fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const summary = [
    {
      label: 'Open Requests',
      value: stats.openCount,
      icon: Wrench,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    { label: 'Total Requests', value: stats.count, icon: Inbox, color: 'text-blue-600', bg: 'bg-blue-50' },
    {
      label: 'Urgent',
      value: stats.urgentCount,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
            <p className="text-gray-500 mt-1">
              {isManagement ? 'All maintenance requests' : 'Report an issue or track your requests'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchRequests}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {canReport && (
              <Button className="gap-2" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Report Issue
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

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No maintenance requests yet</p>
              {canReport && (
                <Button variant="outline" className="mt-4" onClick={() => setModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Report the first issue
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.id} className="card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-gray-100 flex-shrink-0">
                        <Wrench className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">{request.title}</h3>
                          <Badge variant={PRIORITY_VARIANTS[request.priority] || 'default'} size="sm">
                            {request.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 max-w-xl">{request.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>Unit {request.unit?.unitNumber || '—'}</span>
                          <span>•</span>
                          <span>{formatDate(request.createdAt)}</span>
                          {request.assignedTo && (
                            <>
                              <span>•</span>
                              <span>Assigned to {request.assignedTo.firstName} {request.assignedTo.lastName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={STATUS_VARIANTS[request.status] || 'default'}>
                        {request.status.replace(/_/g, ' ')}
                      </Badge>
                      {isManagement && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-36">
                            <Select
                              name={`status-${request.id}`}
                              aria-label="Update status"
                              className="h-8 text-xs"
                              options={STATUS_OPTIONS}
                              value={statusDrafts[request.id] ?? request.status}
                              onChange={(e) =>
                                setStatusDrafts((d) => ({ ...d, [request.id]: e.target.value }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 flex-shrink-0"
                            disabled={updatingId === request.id}
                            loading={updatingId === request.id}
                            onClick={() => handleStatusUpdate(request.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Update
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Report Issue Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Report an Issue"
        subtitle="Our team will be notified as soon as you submit"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            name="title"
            label="Title"
            placeholder="e.g. Leaking kitchen sink"
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
              rows={4}
              placeholder="Describe the issue in detail..."
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
