'use client';

import { Home } from 'lucide-react';
import Link from 'next/link';
import { SettingsToggleButton, SettingsPanel } from '@/components/settings/settings-panel';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0f1a] p-4 relative overflow-hidden" data-settings-root>
      {/* Grid Background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(226, 183, 20, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(226, 183, 20, 0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glow effects */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e2b714]/[0.03] rounded-full blur-[120px] pointer-events-none" />

      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mb-8 relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-[#e2b714]/10 flex items-center justify-center border border-[#e2b714]/20">
          <Home className="w-6 h-6 text-[#e2b714]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#d4d4d4]">Boma Yangu</h1>
          <p className="text-xs text-[#e2b714]/70 font-medium">Rental Management</p>
        </div>
      </Link>

      {/* Auth Card */}
      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl border border-[#e2b714]/10 bg-[#1a1a2e]/80 backdrop-blur-xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-[#d4d4d4]">{title}</h2>
            {subtitle && (
              <p className="mt-2 text-sm text-[#646669]">{subtitle}</p>
            )}
          </div>
          {children}
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-xs text-[#585858]">
          &copy; {new Date().getFullYear()} Boma Yangu. All rights reserved.
        </p>
      </div>

      <SettingsToggleButton />
      <SettingsPanel />
    </div>
  );
}
