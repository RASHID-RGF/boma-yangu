'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout/auth-layout';
import { useAuth } from '@/hooks/useAuth';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';

function GoogleLogo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#EA4335"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#4285F4"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.15-3.15c-.83.54-1.82.84-2.85.84-2.08 0-3.94-.85-5.29-2.22l-.9-.62C6.15 20.55 9.4 23 12 23z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { user } = useAuth();

  if (user) {
    window.location.href = '/dashboard';
    return null;
  }

  const params = useSearchParams();
  const redirectParam = params.get('redirect');
  const redirectTo = redirectParam?.toString() || '/dashboard';

  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your account to continue">
      <div className="space-y-6">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 text-center mb-4">
            Sign in with your Google account to access Boma Yangu
          </p>

          <GoogleSignInButton
            label="Continue with Google"
            className="w-full"
            onSuccess={async (credential) => {
              const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential }),
              });

              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || 'Google sign-in failed');
              }
            }}
            onError={(message) => {
              if (message) {
                toast.error(message);
              }
            }}
          />
        </div>

        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#e2b714] hover:text-[#f5d742] font-medium">
            Create one
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
