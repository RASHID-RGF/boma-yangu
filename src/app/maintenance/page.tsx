'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { Wrench, Plus, RefreshCw, Inbox, AlertTriangle, CheckCircle2, Mail, DoorOpen, Home, MessageSquare } from 'lucide-react';
import { SendMailModal } from '@/components/ui/send-mail-modal';

interface MaintenanceRow {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  unit?: { unitNumber: string; property?: { name: string } } | null;
  tenant?: { firstName: string; lastName: string } | null;
  reportedBy?: { firstName: string; lastName: string; role: string } | null;
  assignedTo?: { firstName: string; lastName: string } | null;
}

/** Roles that raise requests on behalf of the property side. */
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'LANDLORD', 'MANAGER'];
const isManagementReporter = (role?: string) => !!role && MANAGEMENT_ROLES.includes(role);

/** "From tenant" / "From landlord" — so each side sees who raised it. */
function requestOrigin(request: MaintenanceRow) {
  return isManagementReporter(request.reportedBy?.role)
    ? { label: 'From landlord', variant: 'purple' as const }
    : { label: 'From tenant', variant: 'info' as const };
}

/** Name of the person who raised the request. */
function reporterName(request: MaintenanceRow) {
  const reporter = request.reportedBy;
  if (!reporter) return '';
  const name = `${reporter.firstName} ${reporter.lastName}`.trim();
  if (!name) return '';
  return isManagementReporter(reporter.role) ? `${name} (management)` : `${name} (tenant)`;
}

interface RoomContext {
  id: string;
  unitNumber: string;
  property?: { id: string; name: string } | null;
}

const PRIORITY_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  URGENT: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'info',
};

const STATUS_OPTIONS = [
  { value: 'REPORTED', label: 'Reported' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function MaintenancePage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD);
  const isTenant = user?.role === UserRole.TENANT;
  // Both tenants and management can report issues.
  const canReport = true;
  const [requests, setRequests] = useState<MaintenanceRow[]>([]);
  const [stats, setStats] = useState({ openCount: 0, count: 0, urgentCount: 0 });
  const [room, setRoom] = useState<RoomContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState(false);

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
      // Tenant: also fetch room context so the page shows which room these requests are for.
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
          // Room context is optional for the maintenance page.
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [isManagement]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Creating a request lives on its own page (/maintenance/new) so both sides
  // use the exact same form — including the room picker for landlords.

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
              {isManagement
                ? 'Requests from your tenants — and any you raise for them'
                : 'Raise a request and follow the ones your landlord sends you'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMailOpen(true)} className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Send Message
            </Button>
            <button
              onClick={fetchRequests}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {canReport && (
              <Link href="/maintenance/new">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Request
                </Button>
              </Link>
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
                    {room.property?.name || 'Your property'} — maintenance for your room
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
                  Your landlord has not allocated you a room. Once they do, your maintenance requests will be linked to it.
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
                <Link href="/maintenance/new">
                  <Button variant="outline" className="mt-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Send the first request
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const origin = requestOrigin(request);
              const reporter = reporterName(request);
              return (
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
                            <Badge variant={origin.variant} size="sm">{origin.label}</Badge>
                            <Badge variant={PRIORITY_VARIANTS[request.priority] || 'default'} size="sm">
                              {request.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 max-w-xl">{request.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                            <span>
                              {request.unit?.unitNumber
                                ? `Unit ${request.unit.unitNumber}${request.unit.property?.name ? ` • ${request.unit.property.name}` : ''}`
                                : 'Estate-wide'}
                            </span>
                            <span>•</span>
                            <span>{formatDate(request.createdAt)}</span>
                            {reporter && (
                              <>
                                <span>•</span>
                                <span>{reporter}</span>
                              </>
                            )}
                            {!isManagement && request.tenant && (
                              <>
                                <span>•</span>
                                <span>
                                  For {request.tenant.firstName} {request.tenant.lastName}
                                </span>
                              </>
                            )}
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
              );
            })}
          </div>
        )}
      </div>

      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
