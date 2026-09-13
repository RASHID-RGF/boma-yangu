'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          prompt: (callback?: (notification: { isNotDisplayed: () => void; isSkippedMoment: () => void }) => void) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => Promise<void> | void;
  onError?: (message: string) => void;
  label?: string;
  className?: string;
}

// Google "G" logo SVG - official colors: #4285F4, #EA4335, #FBBC05, #34A853
export function GoogleLogo({ className = 'w-5 h-5' }: { className?: string }) {
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

export function GoogleSignInButton({
  onSuccess,
  onError,
  label = 'Continue with Google',
  className = '',
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    '';

  useEffect(() => {
    if (!clientId || typeof window === 'undefined') {
      return;
    }

    const existingScript = document.getElementById('google-gsi-script');
    if (existingScript) {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response.credential) {
              onError?.('Google sign-in was cancelled');
              return;
            }

            setLoading(true);
            try {
              await onSuccess(response.credential);
              window.location.href = '/dashboard';
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Google sign-in failed';
              onError?.(message);
            } finally {
              setLoading(false);
            }
          },
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.accounts?.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (!response.credential) {
            onError?.('Google sign-in was cancelled');
            return;
          }

          setLoading(true);
          try {
            await onSuccess(response.credential);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Google sign-in failed';
            onError?.(message);
          } finally {
            setLoading(false);
          }
        },
      });
    };

    document.head.appendChild(script);
  }, [clientId, onError, onSuccess]);

  const handleClick = () => {
    setLoading(true);
    window.location.href = '/api/auth/google/signin';
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 active:scale-[0.98] transition-all duration-200 shadow-sm hover:shadow-md ${className}`}
    >
      {loading ? (
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin opacity-50" />
          <span className="text-sm font-medium text-gray-500">Redirecting to Google...</span>
        </div>
      ) : (
        <>
          <GoogleLogo className="w-6 h-6" />
          <span className="text-sm font-semibold text-gray-700">{label}</span>
        </>
      )}
    </button>
  );
}
