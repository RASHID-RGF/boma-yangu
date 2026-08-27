'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils/format';
import { UNIT_STATUS_LABELS } from '@/types';
import {
  DoorOpen, Search, Home, Users, Landmark, RefreshCw, Inbox,
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

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export default function UnitsPage() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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

  const filtered = units.filter((u) => {
    const matchesSearch = u.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
      (u.property?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.tenants?.[0] ? `${u.tenants[0].firstName} ${u.tenants[0].lastName}`.toLowerCase().includes(search.toLowerCase()) : false);
    const matchesStatus = !statusFilter || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const vacantUnits = units.filter((u) => u.status === 'VACANT').length;
  const occupiedUnits = units.filter((u) => u.status === 'OCCUPIED').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Units</h1>
            <p className="text-gray-500 mt-1">All units — assign tenants to units so they pay for their own unit</p>
          </div>
          <button
            onClick={fetchUnits}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
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
                      <Badge variant={STATUS_VARIANTS[unit.status] || 'default'} size="sm">
                        {unit.status.replace(/_/g, ' ')}
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
                      <p className="text-xs text-gray-400 mt-0.5">
                        Assign a tenant to this unit from the Tenants section so they pay this rent.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
