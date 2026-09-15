'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDate, formatDateTime, formatTime, getInitials, formatPhone } from '@/lib/utils/format';
import { USER_ROLE_LABELS, UserRole, type User } from '@/types';
import {
  Users, Plus, Search, Mail, Phone, Shield, UserCheck, LogIn,
  Trash2, Pencil, X, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_OPTIONS = Object.values(UserRole).map((r) => ({
  value: r,
  label: USER_ROLE_LABELS[r],
}));

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  role: UserRole.TENANT,
};

interface ApiUser extends Omit<User, 'createdAt' | 'updatedAt'> {
  phone: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LoginRecord {
  id: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; role: string };
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loginRecords, setLoginRecords] = useState<LoginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<ApiUser | null>(null);
  const [deleting, setDeleting] = useState<ApiUser | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isAdmin = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD);
  const isSuperAdmin = !!user && user.role === UserRole.SUPER_ADMIN;

  useEffect(() => {
    if (user && !isAdmin) {
      toast.error('You do not have permission to manage users');
      router.replace('/dashboard');
    }
  }, [user, isAdmin, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) setUsers(data.data || []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogins = useCallback(async () => {
    try {
      const res = await fetch('/api/users/logins');
      const data = await res.json();
      if (data.success) setLoginRecords(data.data || []);
    } catch {
      // Non-fatal: login history is supplementary
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchUsers(), fetchLogins()]);
  }, [fetchUsers, fetchLogins]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchLogins();
    } else if (user) {
      setLoading(false);
    }
  }, [isAdmin, user, fetchUsers, fetchLogins]);

  const filtered = users.filter((u) => {
    const matchesSearch =
      !search ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone || '').includes(search);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === UserRole.SUPER_ADMIN || u.role === UserRole.LANDLORD).length,
    tenants: users.filter((u) => u.role === UserRole.TENANT).length,
    verified: users.filter((u) => u.isVerified).length,
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create user');
      toast.success('User created successfully');
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, updates: Partial<ApiUser>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update user');
      toast.success('User updated');
      fetchUsers();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
      return false;
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete user');
      toast.success('User deleted');
      setDeleting(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 mt-1">Manage accounts, roles, and verification status</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            {isSuperAdmin && (
              <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add User
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Admins / Landlords</p>
                <p className="text-xl font-bold text-gray-900">{stats.admins}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Tenants</p>
                <p className="text-xl font-bold text-gray-900">{stats.tenants}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50">
                <UserCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Verified</p>
                <p className="text-xl font-bold text-gray-900">{stats.verified}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="max-w-md flex-1">
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="w-48">
            <Select
              options={[{ value: '', label: 'All roles' }, ...ROLE_OPTIONS]}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-gray-400 animate-pulse">Loading users...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">User</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Contact</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Role</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Last Login</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Created</th>
                      <th className="w-10 px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((user) => {
                      const statusBadge = (
                        <Badge variant={user.isVerified ? 'success' : 'warning'}>
                          {user.isVerified ? 'Verified' : 'Unverified'}
                        </Badge>
                      );
                      return (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e2b714] to-[#c9a010] flex items-center justify-center text-[#0f0f1a] text-sm font-bold">
                              {getInitials(user.firstName, user.lastName)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                              <p className="text-xs text-gray-400">ID: {user.id.slice(-6).toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Mail className="w-3.5 h-3.5 text-gray-400" />
                              {user.email}
                            </div>
                            {user.phone && (
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Phone className="w-3.5 h-3.5 text-gray-400" />
                                {formatPhone(user.phone)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isSuperAdmin ? (
                            <Select
                              className="w-40 h-8 text-xs"
                              options={ROLE_OPTIONS}
                              value={user.role}
                              onChange={(e) => handleUpdate(user.id, { role: e.target.value as UserRole })}
                            />
                          ) : (
                            <Badge variant="primary">{USER_ROLE_LABELS[user.role]}</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isSuperAdmin ? (
                            <button
                              onClick={() => handleUpdate(user.id, { isVerified: !user.isVerified })}
                              title="Toggle verification"
                            >
                              {statusBadge}
                            </button>
                          ) : (
                            statusBadge
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {user.lastLoginAt ? (
                            <div>
                              <p className="text-sm text-gray-700">{formatDate(user.lastLoginAt)}</p>
                              <p className="text-xs text-gray-400">{formatTime(user.lastLoginAt)}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Never</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">{formatDate(user.createdAt)}</span>
                        </td>
                        <td className="px-6 py-4">
                          {isSuperAdmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                title="Edit"
                                onClick={() => setEditing(user)}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                                title="Delete"
                                onClick={() => setDeleting(user)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Logins */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LogIn className="w-4 h-4 text-[#e2b714]" />
              <h3 className="text-base font-semibold text-gray-900">Recent Logins</h3>
            </div>
            <span className="text-xs text-gray-400">{loginRecords.length} most recent</span>
          </div>
          {loginRecords.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No logins recorded yet — they will appear here and in the database (loginRecords table) as users sign in.
            </p>
          ) : (
            <div className="space-y-3">
              {loginRecords.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                      <LogIn className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {rec.user.firstName} {rec.user.lastName}
                        <span className="text-gray-400 font-normal"> · {rec.email}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(rec.createdAt)}
                        {rec.ipAddress ? ` · ${rec.ipAddress}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" size="sm">Logged in</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add User Modal */}
      {showAddModal && (
        <Modal title="Add New User" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" placeholder="John" required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <Input label="Last Name" name="lastName" placeholder="Doe" required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <Input label="Email Address" name="email" type="email" placeholder="user@example.com" required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Phone Number" name="phone" type="tel" placeholder="0712 345 678"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Password" name="password" type="password" placeholder="At least 6 characters" required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Select label="Role" name="role" options={ROLE_OPTIONS} required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={saving}>
                Create User
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleting && (
        <Modal title="Delete User" onClose={() => setDeleting(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete <span className="font-semibold text-gray-900">{deleting.firstName} {deleting.lastName}</span>{' '}
              (<span className="text-gray-900">{deleting.email}</span>)? This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" className="flex-1" loading={saving} onClick={handleDelete}>
                Delete User
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editing && (
        <Modal title="Edit User" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#e2b714] to-[#c9a010] flex items-center justify-center text-[#0f0f1a] font-bold">
                {getInitials(editing.firstName, editing.lastName)}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{editing.firstName} {editing.lastName}</p>
                <p className="text-xs text-gray-500">{editing.email}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Role</p>
              <Select
                name="role"
                options={ROLE_OPTIONS}
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value as UserRole })}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Verification</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="verified"
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={editing.isVerified}
                  onChange={(e) => setEditing({ ...editing, isVerified: e.target.checked })}
                />
                <span className="text-sm text-gray-700">Email verified</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const ok = await handleUpdate(editing.id, { role: editing.role, isVerified: editing.isVerified });
                    if (ok) setEditing(null);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
