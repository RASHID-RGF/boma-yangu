'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import type { User } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(
        errorParam === 'auth_callback_error'
          ? 'Authentication failed. Please try again.'
          : errorParam
      );
    }
  }, [searchParams]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/users/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setUser(data.data);
        }
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = useCallback(async () => {
    // Handled by the Google Identity Services callback posted to /api/auth/google
    // This method is kept for backward compatibility of the AuthContext shape.
    setError('Use the Google Sign-In Button to continue.');
    throw new Error('Use the Google Sign-In Button to continue.');
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Sign out failed');
      }
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
