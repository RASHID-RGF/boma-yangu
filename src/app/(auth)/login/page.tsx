'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout/auth-layout';
import { useAuth } from '@/hooks/useAuth';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, Eye, EyeOff, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

function LoginForm() {
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const redirectParam = params.get('redirect');
  const redirectTo = redirectParam?.toString() || '/dashboard';

  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const error = params.get('error');
    if (error) {
      if (error === 'google_not_configured') {
        toast.error('Google sign-in is not configured in environment variables.');
      } else if (error === 'token_exchange_failed') {
        toast.error('Google token exchange failed. Check client secret in .env.');
      } else if (error === 'access_denied') {
        toast.error('Google sign-in was cancelled.');
      } else if (error === 'invalid_auth_callback') {
        toast.error('Invalid authentication callback.');
      } else {
        toast.error(`Google sign-in error: ${error}`);
      }
    }
  }, [params]);

  if (user) {
    typeof window !== 'undefined' && (window.location.href = redirectTo);
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      // Accept either email or phone — the backend figures out which one matches.
      const isEmail = contact.includes('@');
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: isEmail ? contact : undefined,
          phone: !isEmail ? contact : undefined,
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && data.success === false)) {
        throw new Error((data as { error?: string }).error || 'Login failed');
      }

      toast.success('Welcome back!');
      if (data?.data?.user) {
        updateUser(data.data.user);
      }
      window.location.href = redirectTo;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email or Phone"
          name="contact"
          type={contact.includes('@') ? 'email' : 'tel'}
          placeholder="you@example.com or 0712345678"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          icon={contact.includes('@') ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          required
        />

        <div className="relative">
          <Input
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign In
        </Button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#2a2a3e]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-[0.2em] text-gray-500">
          <span className="bg-[#0f0f1a] px-2">Or continue with</span>
        </div>
      </div>

      <GoogleSignInButton
        label="Continue with Google"
        className="w-full"
        onSuccess={async (credential) => {
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok || (data && data.success === false)) {
            throw new Error((data as { error?: string }).error || 'Google sign-in failed');
          }
          // Redirect after successful sign in
          window.location.href = redirectTo;
        }}
        onError={(message) => {
          if (message) {
            toast.error(message);
          }
        }}
      />

      <p className="text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[#e2b714] hover:text-[#f5d742] font-medium">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your account to continue">
      <Suspense fallback={<div className="space-y-6"><div className="space-y-4"><p className="text-sm text-gray-500 text-center mb-4">Loading...</p></div></div>}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
