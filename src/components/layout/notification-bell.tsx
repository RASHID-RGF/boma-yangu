'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Bell,
  CheckCheck,
  FileText,
  AlertCircle,
  Info,
  Wrench,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/** Kept in sync with src/app/notifications/page.tsx. */
const TYPE_ICONS: Record<string, React.ReactNode> = {
  RENT_DUE: <AlertCircle className="w-4 h-4" />,
  PAYMENT_RECEIVED: <CheckCheck className="w-4 h-4" />,
  MAINTENANCE_UPDATE: <Wrench className="w-4 h-4" />,
  LEASE_EXPIRY: <FileText className="w-4 h-4" />,
  INVOICE_GENERATED: <FileText className="w-4 h-4" />,
  ANNOUNCEMENT: <Info className="w-4 h-4" />,
  MESSAGE: <MessageSquare className="w-4 h-4" />,
};

/** Dark-theme accents used by the popup and the dropdown rows. */
const TYPE_ACCENT: Record<string, string> = {
  RENT_DUE: 'text-red-400 bg-red-500/10',
  PAYMENT_RECEIVED: 'text-emerald-400 bg-emerald-500/10',
  MAINTENANCE_UPDATE: 'text-amber-400 bg-amber-500/10',
  LEASE_EXPIRY: 'text-purple-400 bg-purple-500/10',
  INVOICE_GENERATED: 'text-blue-400 bg-blue-500/10',
  ANNOUNCEMENT: 'text-[#d4d4d4] bg-white/5',
  MESSAGE: 'text-[#e2b714] bg-[#e2b714]/10',
};

const POLL_INTERVAL_MS = 10_000;

function iconFor(type: string) {
  return TYPE_ICONS[type] || <Info className="w-4 h-4" />;
}

function accentFor(type: string) {
  return TYPE_ACCENT[type] || 'text-[#d4d4d4] bg-white/5';
}

/**
 * Live notifications for the header: polls for new notifications, raises a
 * popup toast for each one that arrives while the user is signed in, keeps an
 * unread badge, and lists recent notifications in a dropdown.
 *
 * The first response is treated as a baseline so page loads never replay
 * history as a wall of popups — only notifications that arrive afterwards
 * (e.g. a message just sent to this user) pop up.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /** Mark read (optimistically), then route: messages go to the inbox. */
  const openNotification = useCallback(
    async (n: NotificationRow) => {
      if (!n.isRead) {
        setItems((prev) => prev.map((row) => (row.id === n.id ? { ...row, isRead: true } : row)));
        setUnread((prev) => Math.max(0, prev - 1));
        try {
          await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: n.id }),
          });
        } catch {
          // Badge already updated optimistically — the next poll reconciles.
        }
      }
      router.push(n.type === 'MESSAGE' ? '/messages' : '/notifications');
    },
    [router]
  );

  /** The popup itself. */
  const showPopup = useCallback(
    (n: NotificationRow) => {
      toast.custom(
        (t) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              void openNotification(n);
            }}
            className={`pointer-events-auto w-[23rem] max-w-[calc(100vw-2rem)] text-left rounded-xl border border-[#e2b714]/30 bg-[#1a1a2e] p-4 shadow-2xl animate-fade-in transition-transform duration-200 hover:-translate-y-0.5`}
          >
            <div className="flex items-start gap-3">
              <span className={`p-2 rounded-lg flex-shrink-0 ${accentFor(n.type)}`}>
                {iconFor(n.type)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#e2b714]">
                  {n.type === 'MESSAGE' ? 'New message' : 'Notification'}
                </p>
                <p className="text-sm font-semibold text-[#d4d4d4] truncate">{n.title}</p>
                <p className="text-xs text-[#a0a0a0] mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-[#585858] mt-1.5">Click to open</p>
              </div>
            </div>
          </button>
        ),
        { duration: 8000 }
      );
    },
    [openNotification]
  );

  /** Fetch notifications; pop up anything that arrived since the last check. */
  const refresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const result = await res.json();
      if (!result?.success) return;

      const rows: NotificationRow[] = result.data ?? [];
      setItems(rows);
      setUnread(
        typeof result.stats?.unreadCount === 'number'
          ? result.stats.unreadCount
          : rows.filter((r) => !r.isRead).length
      );

      // First response = baseline (do not replay old notifications as popups).
      if (seenRef.current === null) {
        seenRef.current = new Set(rows.map((r) => r.id));
        return;
      }
      for (const row of rows) {
        if (!seenRef.current.has(row.id) && !row.isRead) {
          seenRef.current.add(row.id);
          showPopup(row);
        }
      }
    } catch {
      // Network hiccup — the next tick retries.
    }
  }, [showPopup]);

  // Poll for new notifications (and catch up immediately on tab focus).
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    if (unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      // Next poll reconciles the badge.
    }
  };

  const refreshNow = () => {
    setRefreshing(true);
    seenRef.current = seenRef.current ?? new Set<string>();
    void refresh().finally(() => setRefreshing(false));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-[#646669] hover:text-[#d4d4d4] hover:bg-[#e2b714]/5 transition-all duration-200"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-[#0f0f1a]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl shadow-xl z-20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a3e]">
              <p className="text-xs font-semibold text-[#d4d4d4]">
                Notifications{unread > 0 ? ` · ${unread} new` : ''}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={refreshNow}
                  aria-label="Refresh notifications"
                  className="p-1 rounded text-[#585858] hover:text-[#d4d4d4] hover:bg-[#e2b714]/5 transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unread === 0}
                  className="p-1 rounded text-[#585858] hover:text-[#d4d4d4] hover:bg-[#e2b714]/5 transition-all disabled:opacity-40"
                  aria-label="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-[#585858]">No notifications yet</p>
              ) : (
                items.slice(0, 12).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void openNotification(n);
                    }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-[#2a2a3e]/60 last:border-b-0 transition-colors hover:bg-[#e2b714]/5 ${
                      n.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    <span className={`p-1.5 rounded-lg flex-shrink-0 ${accentFor(n.type)}`}>
                      {iconFor(n.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[#d4d4d4] truncate">
                        {n.title}
                      </span>
                      <span className="block text-[11px] text-[#a0a0a0] line-clamp-2 mt-0.5">
                        {n.message}
                      </span>
                      <span className="block text-[10px] text-[#585858] mt-1">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#e2b714] mt-1.5 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/notifications');
              }}
              className="w-full px-4 py-2.5 text-xs font-medium text-[#e2b714] hover:bg-[#e2b714]/5 border-t border-[#2a2a3e] transition-colors"
            >
              View all notifications
            </button>
          </div>
        </>
      )}
    </div>
  );
}
