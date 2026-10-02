'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils/format';
import { PropertyType, PROPERTY_TYPE_LABELS } from '@/types';
import { PLATFORM_TILL_NUMBER } from '@/lib/payments/platform';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  Building2, Plus, Search, MapPin, Home,
  Users, MoreHorizontal, Inbox, Wallet, Mail, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { SendMailModal } from '@/components/ui/send-mail-modal';

interface PropertyRow {
  id: string;
  name: string;
  type: PropertyType;
  status: string;
  city?: string | null;
  address?: string | null;
  totalUnits: number;
  occupiedUnits: number;
  monthlyIncome: number;
  description?: string | null;
  mpesaPaybill?: string | null;
  mpesaTillNumber?: string | null;
  mpesaAccountName?: string | null;
  palplussChannelId?: string | null;
}

const PROPERTY_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  ...Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

export default function PropertiesPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Rent-collection modal: read-only view of the payment destination, which
  // is locked to the platform Buy Goods till and cannot be changed per property.
  const [mailOpen, setMailOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelProperty, setChannelProperty] = useState<PropertyRow | null>(null);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/properties');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load properties');
      setProperties(result.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  // Open the Rent Collection modal showing the fixed platform destination.
  const openChannelModal = (property: PropertyRow) => {
    setChannelProperty(property);
    setChannelOpen(true);
  };

  const filtered = properties.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.city || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = !typeFilter || p.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
            <p className="text-gray-500 mt-1">Manage all your rental properties</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMailOpen(true)} className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Send Message
            </Button>
            <Link href="/properties/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Property
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search properties..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <Select
            options={PROPERTY_TYPE_OPTIONS}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-44"
          />
        </div>

        {/* Property Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
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
              <p>{search || typeFilter ? 'No properties match your filters' : 'No properties yet. Add your first property to get started.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((property) => (
              <Link key={property.id} href={`/properties/${property.id}`}>
                <Card className="card-hover cursor-pointer group">
                  <div className="h-40 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-t-xl flex items-center justify-center relative overflow-hidden">
                    <Building2 className="w-16 h-16 text-emerald-300" />
                    <Badge
                      variant={STATUS_VARIANTS[property.status] || 'default'}
                      className="absolute top-3 right-3"
                    >
                      {property.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
                      {property.name}
                    </h3>
                    <div className="space-y-2 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" />
                        {property.city}, {property.address}
                      </div>
                      <div className="flex items-center gap-2">
                        <Home className="w-3.5 h-3.5" />
                        {property.occupiedUnits}/{property.totalUnits} Units Occupied
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        {PROPERTY_TYPE_LABELS[property.type]}
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(property.monthlyIncome)}/mo
                      </span>
                      {isManagement && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-emerald-600 border-emerald-200"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openChannelModal(property);
                          }}
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          {`Till: ${PLATFORM_TILL_NUMBER}`}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Rent Collection Modal — fixed platform till, read-only */}
      <Modal
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
        title="Rent Collection"
        subtitle={channelProperty ? `${channelProperty.name} — where rent lands` : ''}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              M-Pesa Buy Goods Till {PLATFORM_TILL_NUMBER}
            </p>
            <p className="text-xs text-emerald-700/80 mt-1">
              Every rent payment for this property is pushed to this till. The destination is fixed
              for the whole platform and cannot be changed — tenants just tap Pay and enter their
              M-Pesa PIN.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={() => setChannelOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
