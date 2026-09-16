'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils/format';
import { PropertyType, PROPERTY_TYPE_LABELS } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  Building2, Plus, Search, MapPin, Home,
  Users, MoreHorizontal, Inbox, Wallet, Mail,
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

  // Rent-collection modal: register this property's own till/paybill so rent
  // lands in the landlord's own account (multi-landlord routing).
  const [mailOpen, setMailOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelProperty, setChannelProperty] = useState<PropertyRow | null>(null);
  const [savingChannel, setSavingChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({
    type: 'TILL',
    shortcode: '',
    accountName: '',
    accountNumber: '',
  });

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

  // Open the Rent Collection modal prefilled from the property's saved details.
  const openChannelModal = (property: PropertyRow) => {
    setChannelProperty(property);
    setChannelForm({
      type: property.mpesaTillNumber ? 'TILL' : 'PAYBILL',
      shortcode: property.mpesaTillNumber || property.mpesaPaybill || '',
      accountName: property.mpesaAccountName || property.name,
      accountNumber: '',
    });
    setChannelOpen(true);
  };

  // Register the till/paybill as a PalPluss channel for this property.
  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelProperty) return;
    setSavingChannel(true);
    try {
      const res = await fetch(`/api/properties/${channelProperty.id}/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: channelForm.type,
          shortcode: channelForm.shortcode.trim(),
          accountName: channelForm.accountName.trim() || undefined,
          accountNumber: channelForm.accountNumber.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to register till/paybill');
      toast.success(
        channelForm.type === 'TILL'
          ? `Rent for ${channelProperty.name} will now be collected to till ${channelForm.shortcode.trim()}`
          : `Rent for ${channelProperty.name} will now be collected to paybill ${channelForm.shortcode.trim()}`
      );
      setChannelOpen(false);
      await fetchProperties();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register till/paybill');
    } finally {
      setSavingChannel(false);
    }
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
              <Mail className="w-4 h-4" />
              Send Mail
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
                          variant={property.palplussChannelId ? 'outline' : 'ghost'}
                          className={`gap-1.5 ${property.palplussChannelId ? 'text-emerald-600 border-emerald-200' : 'text-gray-500'}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openChannelModal(property);
                          }}
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          {property.palplussChannelId
                            ? `Till/Paybill: ${property.mpesaTillNumber || property.mpesaPaybill}`
                            : 'Set Rent Collection'}
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

      {/* Rent Collection Modal — register this property's till/paybill */}
      <Modal
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
        title="Rent Collection"
        subtitle={channelProperty ? `${channelProperty.name} — where should rent land?` : ''}
      >
        <form onSubmit={handleSaveChannel} className="space-y-4">
          <Select
            name="type"
            label="Collection Type"
            options={[
              { value: 'TILL', label: 'Buy Goods Till' },
              { value: 'PAYBILL', label: 'Paybill' },
            ]}
            value={channelForm.type}
            onChange={(e) => setChannelForm((f) => ({ ...f, type: e.target.value }))}
          />
          <Input
            name="shortcode"
            label={channelForm.type === 'TILL' ? 'Till Number' : 'Paybill Number'}
            placeholder={channelForm.type === 'TILL' ? 'e.g. 123456' : 'e.g. 123456'}
            required
            value={channelForm.shortcode}
            onChange={(e) => setChannelForm((f) => ({ ...f, shortcode: e.target.value }))}
            icon={<Wallet className="w-4 h-4" />}
          />
          {channelForm.type === 'PAYBILL' && (
            <Input
              name="accountNumber"
              label="Account Number (optional)"
              placeholder="e.g. unit reference — blank = room name"
              value={channelForm.accountNumber}
              onChange={(e) => setChannelForm((f) => ({ ...f, accountNumber: e.target.value }))}
            />
          )}
          <Input
            name="accountName"
            label="Account Name"
            placeholder="e.g. Green Heights"
            value={channelForm.accountName}
            onChange={(e) => setChannelForm((f) => ({ ...f, accountName: e.target.value }))}
          />
          <p className="text-xs text-[#646669]">
            Every rent payment for this property is pushed to THIS till/paybill — each landlord
            collects into their own account. Tenants just tap Pay and enter their M-Pesa PIN.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setChannelOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingChannel}>
              Save Collection Details
            </Button>
          </div>
        </form>
      </Modal>
      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
