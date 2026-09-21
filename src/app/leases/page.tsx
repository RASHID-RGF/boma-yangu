'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  FileSignature, Search, RefreshCw, Inbox, DoorOpen, Landmark,
  CalendarDays, Mail, Home, MessageSquare,
} from 'lucide-react';
import { SendMailModal } from '@/components/ui/send-mail-modal';

interface LeaseRow {
  id: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  status: string;
  terms?: string | null;
  isDigitalSignature: boolean;
  tenant?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  unit?: {
    id: string;
    unitNumber: string;
    monthlyRent: number;
    property?: { id: string; name: string } | null;
  } | null;
  createdBy?: { firstName: string; lastName: string; role: string } | null;
}

interface RoomContext {
  id: string;
  unitNumber: string;
  monthlyRent: number;
  property?: { id: string; name: string } | null;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'RENEWED', label: 'Renewed' },
];

export default function LeasesPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD);
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [room, setRoom] = useState<RoomContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [mailOpen, setMailOpen] = useState(false);

  const fetchLeases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leases');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load leases');
      setLeases(result.data || []);
      setRoom(result.room || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeases(); }, [fetchLeases]);

  const filtered = leases.filter((l) => {
    const matchesSearch = !search ||
      `${l.tenant?.firstName} ${l.tenant?.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (l.unit?.unitNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.unit?.property?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = leases.filter((l) => l.status === 'ACTIVE').length;
  const totalRent = leases
    .filter((l) => l.status === 'ACTIVE')
    .reduce((sum, l) => sum + l.monthlyRent, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leases</h1>
            <p className="text-gray-500 mt-1">
              {isManagement ? 'All lease agreements across your properties' : 'Your lease agreement for your allocated room'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMailOpen(true)} className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Send Message
            </Button>
            <button
              onClick={fetchLeases}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Tenant: Your Room context — same pattern as My Room */}
        {!isManagement && room && (
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
                    {room.property?.name || 'Your property'} — {formatCurrency(room.monthlyRent)}/mo
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
        {!isManagement && !room && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100">
                <Home className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">No room allocated yet</p>
                <p className="text-xs text-gray-500">
                  Your landlord has not allocated you a room. Once they do, your lease will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50">
                <FileSignature className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Leases</p>
                <p className="text-xl font-bold text-gray-900">{activeCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <CalendarDays className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Leases</p>
                <p className="text-xl font-bold text-gray-900">{leases.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50">
                <Landmark className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Monthly Rent (Active)</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(totalRent)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search by tenant, unit, or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e2b714]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? 'No leases match your search' : 'No leases yet'}</p>
              {!isManagement && (
                <p className="text-xs mt-1">
                  Your lease will appear here once your landlord creates one for your room.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((lease) => (
              <Card key={lease.id} className="card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-50 flex-shrink-0">
                        <FileSignature className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {lease.tenant?.firstName} {lease.tenant?.lastName}
                          </h3>
                          <Badge variant={STATUS_VARIANTS[lease.status] || 'default'} size="sm">
                            {lease.status}
                          </Badge>
                          {lease.isDigitalSignature && (
                            <Badge variant="info" size="sm">Digital</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          {lease.unit && (
                            <span className="flex items-center gap-1">
                              <DoorOpen className="w-3 h-3" />
                              {lease.unit.unitNumber}
                              {lease.unit.property?.name && ` — ${lease.unit.property.name}`}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {formatDate(lease.startDate)} → {formatDate(lease.endDate)}
                          </span>
                        </div>
                        {lease.terms && (
                          <p className="text-xs text-gray-500 mt-1.5 max-w-xl line-clamp-2">{lease.terms}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(lease.monthlyRent)}/mo
                      </p>
                      {lease.depositAmount > 0 && (
                        <p className="text-xs text-gray-400">
                          Deposit: {formatCurrency(lease.depositAmount)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
