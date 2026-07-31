'use client';

import { useAuth } from '@/hooks/useAuth';
import { Bell, Search, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { getInitials } from '@/lib/utils/format';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <header className="h-14 bg-[#0f0f1a] border-b border-[#e2b714]/[0.06] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onMenuToggle} className="lg:hidden text-[#646669] hover:text-[#d4d4d4]">
          <Menu className="w-4 h-4" />
        </Button>

        {/* Search */}
        <div className="hidden md:flex relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#646669]" />
          <input
            type="text"
            placeholder="Search properties, tenants..."
            className="h-8 w-48 lg:w-72 rounded-lg border border-[#2a2a3e] bg-[#1a1a2e] pl-9 pr-3 text-xs text-[#d4d4d4] placeholder:text-[#585858] focus:outline-none focus:ring-1 focus:ring-[#e2b714] focus:border-transparent transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium text-[#585858] bg-[#0f0f1a] border border-[#2a2a3e] rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-[#646669] hover:text-[#d4d4d4] hover:bg-[#e2b714]/5 transition-all duration-200">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-2 ring-[#0f0f1a]" />
        </button>

        {/* Profile */}
        <div className="relative ml-1">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-[#e2b714]/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#e2b714]/10 border border-[#e2b714]/20 flex items-center justify-center text-[#e2b714] text-[10px] font-bold">
              {user ? getInitials(user.firstName, user.lastName) : 'U'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-medium text-[#d4d4d4] leading-tight">
                {user ? `${user.firstName} ${user.lastName}` : 'User'}
              </p>
              <p className="text-[10px] text-[#646669] leading-tight capitalize">
                {user?.role?.toLowerCase().replace(/_/g, ' ') || 'Loading...'}
              </p>
            </div>
          </button>

          {showProfile && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowProfile(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl shadow-lg py-1.5 z-20">
                <div className="px-4 py-1.5 border-b border-[#2a2a3e]">
                  <p className="text-xs font-medium text-[#d4d4d4]">{user?.firstName} {user?.lastName}</p>
                  <p className="text-[10px] text-[#646669]">{user?.email}</p>
                </div>
                <a href="/settings" className="block px-4 py-1.5 text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4]">Settings</a>
                <a href="/profile" className="block px-4 py-1.5 text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4]">Profile</a>
                <hr className="my-1 border-[#2a2a3e]" />
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
