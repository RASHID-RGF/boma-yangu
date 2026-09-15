'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout/auth-layout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Mail, Lock, Phone, User, Eye, EyeOff } from 'lucide-react';
import { UserRole } from '@/types';
import toast from 'react-hot-toast';

const ROLE_OPTIONS = [
  { value: UserRole.LANDLORD, label: 'Landlord' },
  { value: UserRole.TENANT, label: 'Tenant' },
];

function RegisterForm() {
  const { user, updateUser } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: UserRole.TENANT,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (user) {
    typeof window !== 'undefined' && (window.location.href = '/dashboard');
    return null;
  }

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && data.success === false)) {
        throw new Error((data as { error?: string }).error || 'Registration failed');
      }

      toast.success('Account created successfully!');
      if (data?.data?.user) {
        updateUser(data.data.user);
      }
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            name="firstName"
            placeholder="John"
            value={form.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            icon={<User className="w-4 h-4" />}
            required
          />
          <Input
            label="Last Name"
            name="lastName"
            placeholder="Doe"
            value={form.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            required
          />
        </div>          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            required
          />

        <Input
          label="Phone Number"
          name="phone"
          type="tel"
          placeholder="0712 345 678"
          value={form.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          icon={<Phone className="w-4 h-4" />}
          required
        />

        <Select
          label="I am a"
          name="role"
          options={ROLE_OPTIONS}
          value={form.role}
          onChange={(e) => handleChange('role', e.target.value)}
          required
        />

        <div className="relative">
          <Input
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => handleChange('password', e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <Input
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          placeholder="Repeat your password"
          value={form.confirmPassword}
          onChange={(e) => handleChange('confirmPassword', e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          required
        />

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-[#e2b714] hover:text-[#f5d742] font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthLayout title="Create Account" subtitle="Start managing your properties today">
      <Suspense fallback={<div className="space-y-6"><p className="text-sm text-gray-500 text-center mb-4">Loading...</p></div>}>
        <RegisterForm />
      </Suspense>
    </AuthLayout>
  );
}
