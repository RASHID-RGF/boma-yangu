'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils/format';
import { Bell, RefreshCw, CheckCheck, Wrench, FileText, AlertCircle, Info } from 'lucide-react';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  RENT_DUE: <AlertCircle className="w-4 h-4" />,
  PAYMENT_RECEIVED: <CheckCheck className="w-4 h-4" />,
  MAINTENANCE_UPDATE: <Wrench className="w-4 h-4" />,
  LEASE_EXPIRY: <FileText className="w-4 h-4" />,
  INVOICE_GENERATED: <FileText className="w-4 h-4" />,
  ANNOUNCEMENT: <Info className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  RENT_DUE: 'bg-red-50 text-red-600',
  PAYMENT_RECEIVED: 'bg-emerald-50 text-emerald-600',
  MAINTENANCE_UPDATE: 'bg-amber-50 text-amber-600',
  LEASE_EXPIRY: 'bg-purple-50 text-purple-600',
  INVOICE_GENERATED: 'bg-blue-50 text-blue-600',
  ANNOUNCEMENT: 'bg-gray-100 text-gray-600',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [stats, setStats] = useState({ unreadCount: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load notifications');
      setNotifications(result.data);
      setStats(result.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update');
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setStats((prev) => ({ ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const markAllRead = async () => {
    if (stats.unreadCount === 0) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setStats((prev) => ({ ...prev, unreadCount: 0 }));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-gray-500 mt-1">
              {stats.unreadCount > 0 ? `${stats.unreadCount} unread notification${stats.unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchNotifications}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <Button variant="outline" className="gap-2" onClick={markAllRead} disabled={stats.unreadCount === 0}>
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No notifications yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => !notification.isRead && markRead(notification.id)}
                className={`w-full text-left transition-all duration-200 ${
                  notification.isRead ? 'opacity-60 hover:opacity-90' : 'hover:opacity-100'
                }`}
              >
                <Card className={notification.isRead ? '' : 'border-[#e2b714]/40'}>
                  <CardContent className="p-5 flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl flex-shrink-0 ${TYPE_COLORS[notification.type] || 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_ICONS[notification.type] || <Info className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatDateTime(notification.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
                    </div>
                    {!notification.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#e2b714] mt-1.5 flex-shrink-0" aria-label="Unread" />
                    )}
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
