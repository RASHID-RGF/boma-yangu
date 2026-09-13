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
import { formatCurrency } from '@/lib/utils/format';
import { isVacantUnitStatus, normalizeUnitStatus } from '@/lib/utils/room-assignment';
import { UNIT_STATUS_LABELS, UserRole } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import {
  DoorOpen, Search, Home, Users, Landmark, RefreshCw, Inbox, UserPlus, Phone, Mail, Plus,
} from 'lucide-react';

interface UnitRow {
  id: string;
  unitNumber: string;
  monthlyRent: number;
  status: string;
  bedrooms: number;
  bathrooms: number;
  property?: {
    id: string;
    name: string;
    owner?: { firstName: string; lastName: string } | null;
  } | null;
  tenants?: { id: string; firstName: string; lastName: string }[] | null;
}

interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  unit?: { id: string } | null;
}

interface PropertyOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export default function UnitsPage() {
  const { user } = useAuth();
  const isManagement =
    !!user &&
    (user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.LANDLORD ||
      user.role === UserRole.MANAGER);

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Assign-room modal
  const [assignUnit, setAssignUnit] = useState<UnitRow | null>(null);
  const [assignTenants, setAssignTenants] = useState<TenantOption[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({ tenantId: '', email: '', phone: '', name: '' });

  // Add-unit modal (create a vacant room on an existing property)
  const [addOpen, setAddOpen] = useState(false);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ propertyId: '', unitNumber: '', monthlyRent: '', depositAmount: '' });

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/units');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load units');
      setUnits(result.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load units');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Open the Add Unit modal: load the landlord's properties to attach the room to.
  const openAddUnit = useCallback(async () => {
    setAddForm({ propertyId: '', unitNumber: '', monthlyRent: '', depositAmount: '' });
    setAddOpen(true);
    try {
      const res = await fetch('/api/properties');
      const result = await res.json();
      if (res.ok && result.success) setProperties(result.data || []);
      else throw new Error(result.error || 'Failed to load properties');
    } catch {
      toast.error('Could not load properties');
    }
  }, []);

  // Create the room on the selected property; it starts VACANT.
  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.propertyId) {
      toast.error('Choose the property this room belongs to');
      return;
    }
    if (!addForm.unitNumber.trim()) {
      toast.error('Enter a room name (e.g. Room A)');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: addForm.propertyId,
          unitNumber: addForm.unitNumber.trim(),
          monthlyRent: addForm.monthlyRent === '' ? 0 : Number(addForm.monthlyRent),
          depositAmount: addForm.depositAmount === '' ? 0 : Number(addForm.depositAmount),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to add unit');
      toast.success(`Room ${addForm.unitNumber.trim()} added — it is vacant and ready to allocate`);
      setAddOpen(false);
      await fetchUnits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add unit');
    } finally {
      setAdding(false);
    }
  };

  // Open the assign modal for a room: load tenants who don't have a room yet.
  const openAssignRoom = useCallback(async (unit: UnitRow) => {
    setAssignUnit(unit);
    setAssignForm({ tenantId: '', email: '', phone: '', name: '' });
    try {
      const res = await fetch('/api/tenants');
      const result = await res.json();
      if (res.ok && result.success) {
        setAssignTenants((result.data || []).filter((t: TenantOption) => !t.unit));
      }
    } catch {
      toast.error('Could not load tenants');
    }
  }, []);

  // Assign the room to a selected tenant, or invite a new one by email/phone.
  const handleAssignRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUnit) return;
    if (!assignForm.tenantId && !assignForm.email && !assignForm.phone) {
      toast.error('Pick a tenant or enter an email/phone');
      return;
    }
    setAssigning(true);
    try {
      const payload = assignForm.tenantId
        ? { tenantId: assignForm.tenantId }
        : {
            email: assignForm.email || undefined,
            phone: assignForm.phone || undefined,
            firstName: assignForm.name || undefined,
          };
      const res = await fetch(`/api/units/${assignUnit.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to assign room');
      toast.success(`Room ${assignUnit.unitNumber} assigned`);
      setAssignUnit(null);
      await fetchUnits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign room');
    } finally {
      setAssigning(false);
    }
  };

  const filtered = units.filter((u) => {
    const normalizedStatus = normalizeUnitStatus(u.status);
    const matchesSearch = u.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
      (u.property?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.tenants?.[0] ? `${u.tenants[0].firstName} ${u.tenants[0].lastName}`.toLowerCase().includes(search.toLowerCase()) : false);
    const matchesStatus = !statusFilter || normalizedStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const vacantUnits = units.filter((u) => isVacantUnitStatus(u.status)).length;
  const occupiedUnits = units.filter((u) => !isVacantUnitStatus(u.status)).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Units</h1>
            <p className="text-gray-500 mt-1">All units — assign tenants to units so they pay for their own unit</p>
          </div>
          <div className="flex items-center gap-2">
            {isManagement && (
              <Button className="gap-2" onClick={openAddUnit}>
                <Plus className="w-4 h-4" />
                Add Unit
              </Button>
            )}
            <button
              onClick={fetchUnits}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search units..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-44"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gray-50"><DoorOpen className="w-5 h-5 text-gray-600" /></div>
              <div><p className="text-sm text-gray-500">Total Units</p><p className="text-xl font-bold text-gray-900">{units.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50"><Users className="w-5 h-5 text-emerald-600" /></div>
              <div><p className="text-sm text-gray-500">Occupied</p><p className="text-xl font-bold text-emerald-600">{occupiedUnits}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50"><Home className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-sm text-gray-500">Vacant</p><p className="text-xl font-bold text-amber-600">{vacantUnits}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50"><DoorOpen className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">Occupancy Rate</p><p className="text-xl font-bold text-gray-900">{units.length ? `${Math.round((occupiedUnits / units.length) * 100)}%` : '—'}</p></div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl" />
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
              <p>{search ? 'No units match your search' : 'No units yet'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((unit) => {
              const tenant = unit.tenants?.[0] || null;
              return (
                <Card key={unit.id} className="card-hover">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-900">{unit.unitNumber}</span>
                      </div>
                      <Badge variant={STATUS_VARIANTS[normalizeUnitStatus(unit.status)] || 'default'} size="sm">
                        {normalizeUnitStatus(unit.status).replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{unit.property?.name || 'No property'}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                      <span>{unit.bedrooms} Bed</span>
                      <span>{unit.bathrooms} Bath</span>
                    </div>
                    {tenant ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <Users className="w-3.5 h-3.5" />
                        {tenant.firstName} {tenant.lastName}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-500 mb-3">
                        <Home className="w-3.5 h-3.5" />
                        Vacant
                      </div>
                    )}
                    {unit.property?.owner && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                        <Landmark className="w-3.5 h-3.5" />
                        {unit.property.owner.firstName} {unit.property.owner.lastName}
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-100">
                      <span className="text-sm font-bold text-emerald-600">{formatCurrency(unit.monthlyRent)}/mo</span>
                      {isManagement && isVacantUnitStatus(unit.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 w-full mt-3"
                          onClick={() => openAssignRoom(unit)}
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Assign Tenant
                        </Button>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {isVacantUnitStatus(unit.status)
                            ? 'Assign a tenant to this room — they will see it under My Room after signing in.'
                            : 'This room is occupied.'}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Room Modal */}
      <Modal
        open={!!assignUnit}
        onClose={() => setAssignUnit(null)}
        title={`Assign Room ${assignUnit?.unitNumber || ''}`}
        subtitle={`${assignUnit?.property?.name || 'Property'} — give this room to a tenant`}
      >
        <form onSubmit={handleAssignRoom} className="space-y-4">
          {assignTenants.length > 0 && (
            <Select
              name="tenantId"
              label="Existing Tenant (optional)"
              placeholder="Select a tenant without a room"
              options={assignTenants.map((t) => ({
                value: t.id,
                label:
                  `${t.firstName} ${t.lastName || ''}`.trim() +
                  (t.phone ? ` — ${t.phone}` : ''),
              }))}
              value={assignForm.tenantId}
              onChange={(e) =>
                setAssignForm((f) => ({ ...f, tenantId: e.target.value, email: '', phone: '', name: '' }))
              }
            />
          )}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-[11px] uppercase tracking-wider text-gray-400">
              {assignTenants.length > 0 ? 'or invite a new tenant' : 'invite a tenant'}
            </span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          <Input
            name="email"
            label="New Tenant Email"
            type="email"
            placeholder="e.g. mary@example.com"
            value={assignForm.email}
            onChange={(e) => setAssignForm((f) => ({ ...f, email: e.target.value, tenantId: '' }))}
            icon={<Mail className="w-4 h-4" />}
          />
          <Input
            name="phone"
            label="New Tenant Phone"
            placeholder="e.g. 0712345678"
            value={assignForm.phone}
            onChange={(e) => setAssignForm((f) => ({ ...f, phone: e.target.value, tenantId: '' }))}
            icon={<Phone className="w-4 h-4" />}
          />
          <Input
            name="name"
            label="Name (optional)"
            placeholder="e.g. Mary"
            value={assignForm.name}
            onChange={(e) => setAssignForm((f) => ({ ...f, name: e.target.value, tenantId: '' }))}
          />
          <p className="text-xs text-[#646669]">
            An email or phone is enough. When the tenant signs in with it, this room appears under
            My Room and they can start paying for it.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAssignUnit(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={assigning}>
              Assign Room
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Unit Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Unit"
        subtitle="Create a vacant room on one of your properties"
      >
        <form onSubmit={handleAddUnit} className="space-y-4">
          <Select
            name="propertyId"
            label="Property"
            placeholder={properties.length ? 'Select a property' : 'No properties yet'}
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            value={addForm.propertyId}
            onChange={(e) => setAddForm((f) => ({ ...f, propertyId: e.target.value }))}
          />
          <Input
            name="unitNumber"
            label="Room Name / Unit Number"
            placeholder="e.g. Room A, Unit 1"
            required
            value={addForm.unitNumber}
            onChange={(e) => setAddForm((f) => ({ ...f, unitNumber: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              name="monthlyRent"
              label="Monthly Rent (optional)"
              type="number"
              min="0"
              placeholder="e.g. 12000"
              value={addForm.monthlyRent}
              onChange={(e) => setAddForm((f) => ({ ...f, monthlyRent: e.target.value }))}
            />
            <Input
              name="depositAmount"
              label="Deposit (optional)"
              type="number"
              min="0"
              placeholder="e.g. 12000"
              value={addForm.depositAmount}
              onChange={(e) => setAddForm((f) => ({ ...f, depositAmount: e.target.value }))}
            />
          </div>
          <p className="text-xs text-[#646669]">
            The room is created as vacant and appears in the Units section, ready to allocate to a
            tenant. You can leave rent at 0 and set it later.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adding}>
              Add Unit
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
