'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate, getInitials, formatPhone } from '@/lib/utils/format';
import {
  Users, Plus, Search, Phone, Mail, MapPin,
  MoreHorizontal, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

const DEMO_TENANTS = [
  { id: '1', firstName: 'Jane', lastName: 'Wanjiku', phone: '0712345678', email: 'jane@example.com', unit: 'A12', property: 'Green Heights', rent: 45000, status: 'ACTIVE', moveIn: '2024-01-15' },
  { id: '2', firstName: 'John', lastName: 'Kamau', phone: '0723456789', email: 'john@example.com', unit: 'B3', property: 'Sunrise Bedsitters', rent: 18000, status: 'ACTIVE', moveIn: '2024-02-01' },
  { id: '3', firstName: 'Mary', lastName: 'Nyambura', phone: '0734567890', email: 'mary@example.com', unit: 'C7', property: 'Mountain View', rent: 52000, status: 'ACTIVE', moveIn: '2023-11-01' },
  { id: '4', firstName: 'Peter', lastName: 'Ochieng', phone: '0745678901', email: 'peter@example.com', unit: 'A5', property: 'Green Heights', rent: 42000, status: 'OVERDUE', moveIn: '2024-03-01' },
  { id: '5', firstName: 'Grace', lastName: 'Akinyi', phone: '0756789012', email: 'grace@example.com', unit: 'D2', property: 'CBD Complex', rent: 85000, status: 'ACTIVE', moveIn: '2024-01-01' },
];

export default function TenantsPage() {
  const [search, setSearch] = useState('');

  const filtered = DEMO_TENANTS.filter((t) => 
    `${t.firstName} ${t.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    t.phone.includes(search) || t.unit.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            <p className="text-gray-500 mt-1">Manage your tenants and their leases</p>
          </div>
          <Link href="/tenants/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Tenant
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Tenants</p>
                <p className="text-xl font-bold text-gray-900">{DEMO_TENANTS.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-xl font-bold text-gray-900">{DEMO_TENANTS.filter(t => t.status === 'ACTIVE').length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Overdue</p>
                <p className="text-xl font-bold text-amber-600">{DEMO_TENANTS.filter(t => t.status === 'OVERDUE').length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Monthly Rent</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(DEMO_TENANTS.reduce((s, t) => s + t.rent, 0))}</p>
              </div>
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

        {/* Tenants Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Tenant</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Unit</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Contact</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Rent</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Move In</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                    <th className="w-10 px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-medium">
                            {getInitials(tenant.firstName, tenant.lastName)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{tenant.firstName} {tenant.lastName}</p>
                            <p className="text-xs text-gray-400">ID: {tenant.id.padStart(5, '0')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900 font-medium">{tenant.unit}</p>
                        <p className="text-xs text-gray-400">{tenant.property}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            {formatPhone(tenant.phone)}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                            {tenant.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-gray-900">{formatCurrency(tenant.rent)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{formatDate(tenant.moveIn)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={STATUS_VARIANTS[tenant.status] || 'default'}>
                          {tenant.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <button className="p-1.5 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
