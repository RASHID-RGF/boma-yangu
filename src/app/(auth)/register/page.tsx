'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { Mail, Lock, Phone, User, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_OPTIONS = [
  { value: UserRole.LANDLORD, label: 'Landlord' },
  { value: UserRole.MANAGER, label: 'Property Manager' },
  { value: UserRole.CARETAKER, label: 'Caretaker' },
  { value: UserRole.TENANT, label: 'Tenant' },
];

export default function RegisterPage() {
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
  const { register } = useAuth();
  const router = useRouter();

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
      await register(form);
      toast.success('Account created successfully!');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create Account" subtitle="Start managing your properties today">
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
        </div>

        <Input
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

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-[#e2b714] hover:text-[#f5d742] font-medium">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
