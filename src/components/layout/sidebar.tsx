'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  Users,
  Wallet,
  FileText,
  Wrench,
  FileSignature,
  BarChart3,
  FolderOpen,
  Shield,
  Bell,
  MessageSquare,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Home,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Properties', href: '/properties', icon: <Building2 className="w-4 h-4" /> },
  { label: 'Units', href: '/units', icon: <DoorOpen className="w-4 h-4" /> },
  { label: 'Tenants', href: '/tenants', icon: <Users className="w-4 h-4" /> },
  { label: 'Payments', href: '/payments', icon: <Wallet className="w-4 h-4" /> },
  { label: 'Invoices', href: '/invoices', icon: <FileText className="w-4 h-4" /> },
  { label: 'Maintenance', href: '/maintenance', icon: <Wrench className="w-4 h-4" /> },
  { label: 'Leases', href: '/leases', icon: <FileSignature className="w-4 h-4" /> },
  { label: 'Reports', href: '/reports', icon: <BarChart3 className="w-4 h-4" /> },
  { label: 'Documents', href: '/documents', icon: <FolderOpen className="w-4 h-4" /> },
  { label: 'Messages', href: '/messages', icon: <MessageSquare className="w-4 h-4" /> },
  { label: 'Notifications', href: '/notifications', icon: <Bell className="w-4 h-4" /> },
  { label: 'Admin', href: '/admin', icon: <Shield className="w-4 h-4" />, roles: [UserRole.SUPER_ADMIN] },
];

const PORTAL_ITEMS: NavItem[] = [
  { label: 'My Dashboard', href: '/portal/tenant', icon: <Home className="w-4 h-4" />, roles: [UserRole.TENANT] },
  { label: 'Caretaker Portal', href: '/portal/caretaker', icon: <Shield className="w-4 h-4" />, roles: [UserRole.CARETAKER] },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const filteredItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-[#0f0f1a] border-r border-[#e2b714]/[0.06] text-[#d4d4d4] transition-all duration-300 ease-in-out flex flex-col',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 px-4 border-b border-[#e2b714]/[0.06]',
        isCollapsed ? 'justify-center' : 'justify-start'
      )}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#e2b714]/10 border border-[#e2b714]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[#e2b714] font-bold text-sm">BY</span>
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="font-bold text-sm leading-tight text-[#d4d4d4]">Boma Yangu</h1>
              <p className="text-[#646669] text-[10px] leading-tight">Rental Management</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {/* Portal Items */}
        {user && (user.role === UserRole.TENANT || user.role === UserRole.CARETAKER) && (
          <div className="mb-2">
            {!isCollapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#646669] uppercase tracking-wider">Portal</p>
            )}
            {PORTAL_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 transition-all duration-200 group relative',
                  isActive(item.href)
                    ? 'bg-[#e2b714]/10 text-[#e2b714]'
                    : 'text-[#646669] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4]'
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!isCollapsed && <span className="text-xs font-medium">{item.label}</span>}
                {isActive(item.href) && !isCollapsed && (
                  <span className="absolute right-2 w-1 h-1 rounded-full bg-[#e2b714]" />
                )}
              </Link>
            ))}
            {!isCollapsed && <div className="border-t border-[#e2b714]/[0.06] my-2" />}
          </div>
        )}

        {/* Main Navigation */}
        {!isCollapsed && (
          <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#646669] uppercase tracking-wider">Main Menu</p>
        )}
        <div className="space-y-0.5">
          {filteredItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative',
                isActive(item.href)
                  ? 'bg-[#e2b714]/10 text-[#e2b714]'
                  : 'text-[#646669] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4]'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!isCollapsed && (
                <span className="text-xs font-medium truncate">{item.label}</span>
              )}
              {isActive(item.href) && !isCollapsed && (
                <span className="absolute right-2 w-1 h-1 rounded-full bg-[#e2b714]" />
              )}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-[#e2b714]/[0.06] p-3 space-y-1">
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#646669] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200 w-full text-xs"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && <span className="text-xs font-medium">Settings</span>}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#646669] hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 w-full text-xs"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && <span className="text-xs font-medium">Logout</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-1.5 rounded-lg text-[#585858] hover:text-[#646669] hover:bg-[#e2b714]/5 transition-all duration-200"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
