'use client';

import Link from 'next/link';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

// Google "G" logo SVG - official colors: #4285F4, #EA4335, #FBBC05, #34A853
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

export default function RegisterPage() {
  const { signInWithGoogle, user } = useAuth();

  // If already logged in, redirect
  if (user) {
    window.location.href = '/dashboard';
    return null;
  }

  return (
    <AuthLayout title="Create Account" subtitle="Start managing your properties today">
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600">
            <strong>Sign up with Google</strong> to automatically create your account.
            Your name and email will be imported from Google.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => signInWithGoogle()}
        >
          <span className="flex items-center justify-center gap-3">
            <GoogleLogo className="w-6 h-6" />
            <span className="text-sm font-semibold text-gray-700">Sign up with Google</span>
          </span>
        </Button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-[#e2b714] hover:text-[#f5d742] font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
