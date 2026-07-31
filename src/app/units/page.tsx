'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils/format';
import { UNIT_STATUS_LABELS, UnitStatus } from '@/types';
import {
  DoorOpen, Plus, Search, Home, Users,
  MoreHorizontal,
} from 'lucide-react';
import Link from 'next/link';

const DEMO_UNITS = [
  { id: '1', unitNumber: 'A01', property: 'Green Heights Apartments', monthlyRent: 45000, status: 'OCCUPIED', tenant: 'Jane Wanjiku', bedrooms: 2, bathrooms: 1 },
  { id: '2', unitNumber: 'A02', property: 'Green Heights Apartments', monthlyRent: 42000, status: 'OCCUPIED', tenant: 'Peter Ochieng', bedrooms: 2, bathrooms: 1 },
  { id: '3', unitNumber: 'B01', property: 'Sunrise Bedsitters', monthlyRent: 18000, status: 'OCCUPIED', tenant: 'John Kamau', bedrooms: 1, bathrooms: 1 },
  { id: '4', unitNumber: 'B02', property: 'Sunrise Bedsitters', monthlyRent: 18000, status: 'VACANT', tenant: null, bedrooms: 1, bathrooms: 1 },
  { id: '5', unitNumber: 'C01', property: 'Mountain View Maisonettes', monthlyRent: 52000, status: 'OCCUPIED', tenant: 'Mary Nyambura', bedrooms: 3, bathrooms: 2 },
  { id: '6', unitNumber: 'C02', property: 'Mountain View Maisonettes', monthlyRent: 52000, status: 'UNDER_MAINTENANCE', tenant: null, bedrooms: 3, bathrooms: 2 },
  { id: '7', unitNumber: 'D01', property: 'CBD Commercial Complex', monthlyRent: 85000, status: 'OCCUPIED', tenant: 'Grace Akinyi', bedrooms: 0, bathrooms: 1 },
  { id: '8', unitNumber: 'D02', property: 'CBD Commercial Complex', monthlyRent: 75000, status: 'RESERVED', tenant: null, bedrooms: 0, bathrooms: 1 },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export default function UnitsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = DEMO_UNITS.filter((u) => {
    const matchesSearch = u.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
      u.property.toLowerCase().includes(search.toLowerCase()) ||
      (u.tenant && u.tenant.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = !statusFilter || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const vacantUnits = DEMO_UNITS.filter(u => u.status === 'VACANT').length;
  const occupiedUnits = DEMO_UNITS.filter(u => u.status === 'OCCUPIED').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Units</h1>
            <p className="text-gray-500 mt-1">Manage all units across your properties</p>
          </div>
          <Link href="/units/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Unit
            </Button>
          </Link>
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
              <div><p className="text-sm text-gray-500">Total Units</p><p className="text-xl font-bold text-gray-900">{DEMO_UNITS.length}</p></div>
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
              <div><p className="text-sm text-gray-500">Occupancy Rate</p><p className="text-xl font-bold text-gray-900">{Math.round((occupiedUnits / DEMO_UNITS.length) * 100)}%</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Units Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((unit) => (
            <Card key={unit.id} className="card-hover cursor-pointer group">
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
                <p className="text-sm text-gray-500 mb-3">{unit.property}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                  <span>{unit.bedrooms} Bed</span>
                  <span>{unit.bathrooms} Bath</span>
                </div>
                {unit.tenant && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <Users className="w-3.5 h-3.5" />
                    {unit.tenant}
                  </div>
                )}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(unit.monthlyRent)}/mo</span>
                  <button className="p-1.5 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
