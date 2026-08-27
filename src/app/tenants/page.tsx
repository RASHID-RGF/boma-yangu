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
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, getInitials, formatPhone } from '@/lib/utils/format';
import { UserRole } from '@/types';
import {
  Users, Search, Phone, Mail, DoorOpen,
  Landmark, RefreshCw, Inbox,
} from 'lucide-react';

interface TenantRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  isActive: boolean;
  moveInDate?: string | null;
  createdAt: string;
  unit?: {
    id: string;
    unitNumber: string;
    monthlyRent: number;
    property?: {
      id: string;
      name: string;
      ownerId?: string | null;
      owner?: { firstName: string; lastName: string; email?: string | null } | null;
    } | null;
  } | null;
  user?: { id: string; email: string } | null;
}

interface UnitOption {
  id: string;
  unitNumber: string;
  monthlyRent: number;
  property?: { id: string; name: string } | null;
}

export default function TenantsPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Assign Unit modal
  const [assignTenant, setAssignTenant] = useState<TenantRow | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenants');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load tenants');
      setTenants(result.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  // Fetch the unit list when opening the Assign Unit modal (management only).
  const openAssignModal = useCallback(async (tenant: TenantRow) => {
    setAssignTenant(tenant);
    setSelectedUnitId(tenant.unit?.id || '');
    try {
      const res = await fetch('/api/units');
      const result = await res.json();
      if (res.ok && result.success) setUnits(result.data || []);
    } catch {
      toast.error('Could not load units');
    }
  }, []);

  // Assign the selected unit to the tenant (PATCH /api/tenants/[id]).
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTenant) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/tenants/${assignTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: selectedUnitId || null }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to assign unit');
      toast.success('Unit assigned — the tenant can now pay for this unit');
      setAssignTenant(null);
      await fetchTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign unit');
    } finally {
      setAssigning(false);
    }
  };

  const filtered = tenants.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
      (t.phone || '').includes(search) ||
      (t.unit?.unitNumber || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  });

  const unitOptions: { value: string; label: string }[] = units.map((u) => ({
    value: u.id,
    label: `${u.unitNumber} — ${u.property?.name || 'No property'} (${formatCurrency(u.monthlyRent)}/mo)`,
  }));

  const activeCount = tenants.filter((t) => t.isActive).length;
  const withUnitCount = tenants.filter((t) => t.unit).length;
  const monthlyRent = tenants.reduce((s, t) => s + (t.unit?.monthlyRent || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            <p className="text-gray-500 mt-1">Assign units to tenants so each one pays for their own unit</p>
          </div>
          <button
            onClick={fetchTenants}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50"><Users className="w-5 h-5 text-emerald-600" /></div>
              <div><p className="text-sm text-gray-500">Total Tenants</p><p className="text-xl font-bold text-gray-900">{tenants.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50"><Users className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">Active</p><p className="text-xl font-bold text-gray-900">{activeCount}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50"><DoorOpen className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-sm text-gray-500">With Unit Assigned</p><p className="text-xl font-bold text-amber-600">{withUnitCount}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50"><Landmark className="w-5 h-5 text-purple-600" /></div>
              <div><p className="text-sm text-gray-500">Monthly Rent</p><p className="text-xl font-bold text-gray-900">{formatCurrency(monthlyRent)}</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="max-w-md">
          <Input
            placeholder="Search tenants by name, phone, or unit..."
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
              <p>{search ? 'No tenants match your search' : 'No tenants yet'}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Tenant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Unit</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Landlord</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Contact</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Rent</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                      {isManagement && <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((tenant) => {
                      const landlord = tenant.unit?.property?.owner;
                      return (
                        <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-medium">
                                {getInitials(tenant.firstName, tenant.lastName)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{tenant.firstName} {tenant.lastName}</p>
                                <p className="text-xs text-gray-400">{tenant.user?.email || tenant.email || 'No login account'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {tenant.unit ? (
                              <>
                                <p className="text-sm text-gray-900 font-medium">{tenant.unit.unitNumber}</p>
                                <p className="text-xs text-gray-400">{tenant.unit.property?.name}</p>
                              </>
                            ) : (
                              <span className="text-xs text-amber-500 font-medium">No unit assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {landlord ? (
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Landmark className="w-3.5 h-3.5 text-gray-400" />
                                {landlord.firstName} {landlord.lastName}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Phone className="w-3.5 h-3.5 text-gray-400" />
                                {formatPhone(tenant.phone)}
                              </div>
                              {tenant.email && (
                                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                                  {tenant.email}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-gray-900">
                              {tenant.unit ? formatCurrency(tenant.unit.monthlyRent) : '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={STATUS_VARIANTS[tenant.isActive ? 'ACTIVE' : 'CANCELLED'] || 'default'}>
                              {tenant.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          {isManagement && (
                            <td className="px-6 py-4 text-right">
                              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openAssignModal(tenant)}>
                                <DoorOpen className="w-3.5 h-3.5" />
                                {tenant.unit ? 'Change Unit' : 'Assign Unit'}
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Assign Unit Modal */}
      <Modal
        open={!!assignTenant}
        onClose={() => setAssignTenant(null)}
        title={`Assign Unit — ${assignTenant?.firstName || ''} ${assignTenant?.lastName || ''}`}
        subtitle="The tenant pays for the unit they are assigned to"
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <Select
            name="unitId"
            label="Unit"
            placeholder="Select a unit"
            options={unitOptions}
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            required
          />
          {selectedUnitId && units.find((u) => u.id === selectedUnitId)?.property?.name && (
            <p className="text-xs text-[#646669]">
              Property: {units.find((u) => u.id === selectedUnitId)?.property?.name} — the tenant will be
              linked to this property's landlord and can pay rent for this unit.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAssignTenant(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={assigning}>
              Assign Unit
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
