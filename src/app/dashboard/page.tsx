'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge, STATUS_VARIANTS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardStore } from '@/store/dashboard';
import { formatCurrency, formatDate, formatPercentage } from '@/lib/utils/format';
import type { DashboardStats } from '@/types';
import {
  Building2, DoorOpen, Users, Wallet, TrendingUp, AlertCircle, FileText,
  Wrench, ArrowUpRight, ArrowDownRight, Plus, MoreHorizontal,
  CalendarDays, Download, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';

// Management-only quick actions (properties/tenants/payments are landlord & manager sections)
const MANAGEMENT_ACTIONS = [
  { label: 'Add Property', href: '/properties/new', icon: Building2, color: 'bg-blue-500' },
  { label: 'Add Tenant', href: '/tenants', icon: Users, color: 'bg-emerald-500' },
  { label: 'Record Payment', href: '/payments', icon: Wallet, color: 'bg-purple-500' },
];

// Available to everyone (maintenance concerns all roles)
const GENERAL_ACTIONS = [
  { label: 'Report Issue', href: '/maintenance', icon: Wrench, color: 'bg-amber-500' },
];

export default function DashboardPage() {
  const { stats, loading, fetchStats } = useDashboardStore();
  const { user } = useAuth();
  const [greeting, setGreeting] = useState('Good morning');

  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  const quickActions = [
    ...(isManagement ? MANAGEMENT_ACTIONS : []),
    ...GENERAL_ACTIONS,
  ];

  useEffect(() => {
    fetchStats();
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, [fetchStats]);

  // Role-aware stat cards: managers see the full financial view,
  // tenants see their own obligations, caretakers see the maintenance workload.
  const statCards = !isManagement
    ? user?.role === UserRole.CARETAKER
      ? [
          {
            label: 'Pending Maintenance',
            value: stats?.pendingMaintenance ?? 0,
            icon: Wrench,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            trend: 'Requests to attend',
            trendUp: true,
          },
          {
            label: 'Total Units',
            value: stats?.totalUnits ?? 0,
            icon: DoorOpen,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            trend: `${formatPercentage(stats?.occupancyRate ?? 0)} occupied`,
            trendUp: true,
          },
          {
            label: 'Vacant Units',
            value: stats?.vacantUnits ?? 0,
            icon: Building2,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            trend: 'Ready to fill',
            trendUp: true,
          },
          {
            label: 'Outstanding Balances',
            value: formatCurrency(stats?.outstandingBalances ?? 0),
            icon: Wallet,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            trend: 'Across all units',
            trendUp: false,
          },
        ]
      : [
          {
            label: 'Amount Due',
            value: formatCurrency(stats?.outstandingBalances ?? 0),
            icon: Wallet,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            trend: 'Your outstanding balance',
            trendUp: false,
          },
          {
            label: 'Pending Maintenance',
            value: stats?.pendingMaintenance ?? 0,
            icon: Wrench,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            trend: 'Open requests',
            trendUp: true,
          },
          {
            label: 'My Payments',
            value: stats?.recentPayments?.length ?? 0,
            icon: FileText,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            trend: 'Recorded this period',
            trendUp: true,
          },
          {
            label: 'My Room Occupied',
            value: formatPercentage(stats?.occupancyRate ?? 0),
            icon: TrendingUp,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            trend: 'Your allocated room',
            trendUp: true,
          },
        ]
    : [
        {
          label: 'Total Properties',
          value: stats?.totalProperties ?? 0,
          icon: Building2,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          trend: '+2 this month',
          trendUp: true,
        },
        {
          label: 'Total Units',
          value: stats?.totalUnits ?? 0,
          icon: DoorOpen,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
          trend: `${formatPercentage(stats?.occupancyRate ?? 0)} occupied`,
          trendUp: true,
        },
        {
          label: 'Active Tenants',
          value: stats?.totalTenants ?? 0,
          icon: Users,
          color: 'text-purple-600',
          bg: 'bg-purple-50',
          trend: '12 new this month',
          trendUp: true,
        },
        {
          label: 'Monthly Revenue',
          value: formatCurrency(stats?.monthlyRevenue ?? 0),
          icon: Wallet,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          trend: `${formatCurrency(stats?.outstandingBalances ?? 0)} outstanding`,
          trendUp: false,
        },
      ];

  if (loading && !stats) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-96 bg-gray-100 rounded-xl" />
            <div className="h-96 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{greeting} 👋</h1>
            <p className="text-gray-500 mt-1">
              {isManagement ? "Here's what's happening with your properties today." : "Here's what's happening in your community today."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={fetchStats}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            {isManagement && (
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Tenant: the room the landlord allocated to them */}
        {!isManagement && user?.role === UserRole.TENANT && (
          <Card className={stats?.allocatedRoom ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${stats?.allocatedRoom ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  <DoorOpen className={`w-5 h-5 ${stats?.allocatedRoom ? 'text-emerald-600' : 'text-amber-600'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {stats?.allocatedRoom ? `Your room: ${stats.allocatedRoom.unitNumber}` : 'No room allocated yet'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stats?.allocatedRoom
                      ? `${stats.allocatedRoom.propertyName || 'Your property'} — allocated to you by your landlord.`
                      : 'Your landlord has not allocated you a room yet. Contact them to get a room.'}
                  </p>
                </div>
              </div>
              <Link href="/my-room">
                <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap">
                  View My Room
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <Button variant="outline" size="sm" className="flex items-center gap-2 whitespace-nowrap">
                <div className={`w-2 h-2 rounded-full ${action.color}`} />
                <action.icon className="w-4 h-4" />
                {action.label}
              </Button>
            </Link>
          ))}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.label} className="card-hover">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <span className="text-xs text-gray-400">This month</span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <div className={`flex items-center gap-1 text-xs ${stat.trendUp ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {stat.trendUp ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    <span>{stat.trend}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Payments */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Payments</CardTitle>
              <Link href="/payments">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {stats?.recentPayments && stats.recentPayments.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentPayments.slice(0, 5).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {payment.tenant?.firstName} {payment.tenant?.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {payment.method.replace(/_/g, ' ')} • {formatDate(payment.paymentDate)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(payment.amount)}
                        </p>
                        <Badge variant={STATUS_VARIANTS[payment.status] || 'default'} size="sm">
                          {payment.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No recent payments</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Maintenance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Maintenance</CardTitle>
              <Link href="/maintenance">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-6">
                <div className="text-4xl font-bold text-amber-600">{stats?.pendingMaintenance ?? 0}</div>
                <p className="text-sm text-gray-500">Pending Requests</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Urgent</span>
                  <span className="text-sm font-semibold text-red-600">3</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">High</span>
                  <span className="text-sm font-semibold text-amber-600">5</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Medium</span>
                  <span className="text-sm font-semibold text-blue-600">8</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Low</span>
                  <span className="text-sm font-semibold text-gray-600">4</span>
                </div>
              </div>
              <Link href="/maintenance/new">
                <Button variant="outline" className="w-full mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  New Request
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Income vs Expenses Chart placeholder */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Income vs Expenses</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <CalendarDays className="w-4 h-4 mr-2" />
                This Year
              </Button>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              {stats?.incomeVsExpenses ? (
                <div className="text-center text-gray-400">
                  <BarChartIcon />
                  <p className="mt-2 text-sm">Chart visualization</p>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Income and expense data will appear here</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function BarChartIcon() {
  return (
    <svg className="w-12 h-12 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
