'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PropertyType, PROPERTY_TYPE_LABELS } from '@/types';
import { Building2, ArrowLeft, MapPin, Plus, Trash2, DoorOpen } from 'lucide-react';
import Link from 'next/link';

const PROPERTY_TYPE_OPTIONS = Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface RoomDraft {
  key: number;
  unitNumber: string;
  monthlyRent: string;
  depositAmount: string;
}

let roomKey = 0;
const newRoom = (): RoomDraft => ({
  key: ++roomKey,
  unitNumber: '',
  monthlyRent: '',
  depositAmount: '',
});

export default function NewPropertyPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'APARTMENT',
    address: '',
    city: '',
    country: 'Kenya',
  });

  // Rooms (unit names) created together with the property. All start VACANT.
  const [rooms, setRooms] = useState<RoomDraft[]>([newRoom()]);

  const handleChange = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateRoom = (key: number, field: keyof Omit<RoomDraft, 'key'>, value: string) =>
    setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Only send rooms the landlord actually named; rent is optional.
      const payloadUnits = rooms
        .map((r) => ({
          unitNumber: r.unitNumber.trim(),
          monthlyRent: r.monthlyRent === '' ? 0 : Number(r.monthlyRent),
          depositAmount: r.depositAmount === '' ? 0 : Number(r.depositAmount),
        }))
        .filter((r) => r.unitNumber && Number.isFinite(r.monthlyRent) && Number.isFinite(r.depositAmount));

      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, units: payloadUnits }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to create property');
      const created = result.data?.units?.length
        ? ` with ${result.data.units.length} room${result.data.units.length === 1 ? '' : 's'}`
        : '';
      toast.success(`Property created successfully${created}`);
      router.push('/units');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create property');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/properties">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Add Property</h1>
            <p className="text-gray-500 mt-1">Register a property and its rooms</p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Property Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                name="name"
                label="Property Name"
                placeholder="e.g. Green Heights Apartments"
                required
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Describe the property..."
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              <Select
                name="type"
                label="Property Type"
                options={PROPERTY_TYPE_OPTIONS}
                value={form.type}
                onChange={(e) => handleChange('type', e.target.value)}
              />

              <Input
                name="address"
                label="Address"
                placeholder="e.g. Argwings Kodhek Road"
                required
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
                icon={<MapPin className="w-4 h-4" />}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  name="city"
                  label="City"
                  placeholder="e.g. Nairobi"
                  required
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                />
                <Input
                  name="country"
                  label="Country"
                  placeholder="e.g. Kenya"
                  value={form.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                />
              </div>

              {/* Rooms builder: name rooms so they appear as vacant units */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <DoorOpen className="w-4 h-4" />
                      Rooms (optional)
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setRooms((rs) => [...rs, newRoom()])}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Room
                    </Button>
                  </div>
                  <p className="text-xs text-[#646669] mt-1">
                    Name each room (e.g. Room A, Unit 1). Rooms are created vacant and will show in
                    the Units section ready to allocate to tenants. Rent is optional.
                  </p>
                </div>

                {rooms.map((room, index) => (
                  <div key={room.key} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder={`Room name (e.g. Room ${String.fromCharCode(65 + index)})`}
                        value={room.unitNumber}
                        onChange={(e) => updateRoom(room.key, 'unitNumber', e.target.value)}
                      />
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Rent/mo"
                        value={room.monthlyRent}
                        onChange={(e) => updateRoom(room.key, 'monthlyRent', e.target.value)}
                      />
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Deposit"
                        value={room.depositAmount}
                        onChange={(e) => updateRoom(room.key, 'depositAmount', e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-500 shrink-0"
                      disabled={rooms.length === 1}
                      onClick={() => setRooms((rs) => rs.filter((r) => r.key !== room.key))}
                      aria-label={`Remove room ${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Link href="/properties">
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" loading={submitting}>
                  Create Property
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
