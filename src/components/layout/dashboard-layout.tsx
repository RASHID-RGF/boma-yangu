'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { SettingsToggleButton, SettingsPanel } from '@/components/settings/settings-panel';
import { cn } from '@/lib/utils/cn';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  /** Phone/tablet: the sidebar is an off-canvas drawer opened by the header menu button. */
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Navigating always closes the drawer so the new page is fully visible.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#0f0f1a]" data-settings-root>
      <Sidebar
        isCollapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Scrim behind the mobile drawer */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <div
        className={cn(
          'transition-all duration-300',
          // The rail only indents the page on large screens. On phones the
          // sidebar is a drawer, so content uses the full viewport width.
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        )}
      >
        <Header onMenuToggle={() => setMobileOpen((open) => !open)} />
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
      <SettingsToggleButton />
      <SettingsPanel />
    </div>
  );
}
