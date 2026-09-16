'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatDateTime, getInitials } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquare, Plus, RefreshCw, Send, Mail } from 'lucide-react';
import { SendMailModal } from '@/components/ui/send-mail-modal';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface MessageRow {
  id: string;
  subject: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  sender?: { id: string; firstName: string; lastName: string; role: string } | null;
  receiver?: { id: string; firstName: string; lastName: string; role: string } | null;
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-50 text-red-600',
  LANDLORD: 'bg-blue-50 text-blue-600',
  MANAGER: 'bg-purple-50 text-purple-600',
  CARETAKER: 'bg-emerald-50 text-emerald-600',
  TENANT: 'bg-gray-100 text-gray-600',
};

export default function MessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ receiverId: '', receiverEmail: '', subject: '', content: '' });

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/messages');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load messages');
      setMessages(result.data);
      setContacts(result.contacts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const handleChange = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to send message');
      toast.success('Message sent');
      setModalOpen(false);
      setForm({ receiverId: '', receiverEmail: '', subject: '', content: '' });
      await fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  };

  const contactOptions = contacts.map((c) => ({
    value: c.id,
    label: `${c.firstName} ${c.lastName} (${c.role.replace(/_/g, ' ')})`,
  }));

  const unreadCount = messages.filter((m) => !m.isRead && m.receiver?.id === user?.id).length;

  const markRead = async (id: string) => {
    try {
      const res = await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update');
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            <p className="text-gray-500 mt-1">
              {unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'Communicate with your estate team'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMailOpen(true)} className="gap-2">
              <Mail className="w-4 h-4" />
              Send Mail
            </Button>
            <button
              onClick={fetchMessages}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <Button className="gap-2" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              New Message
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
        ) : messages.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No messages yet</p>
              <Button variant="outline" className="mt-4" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Send your first message
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const incoming = message.receiver?.id === user?.id;
              const other = incoming ? message.sender : message.receiver;
              const unread = incoming && !message.isRead;
              return (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => unread && markRead(message.id)}
                  className="w-full text-left block"
                >
                <Card className={unread ? 'border-[#e2b714]/40' : 'card-hover'}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                        other ? ROLE_COLORS[other.role] || 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {other ? getInitials(other.firstName, other.lastName) : 'BY'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {other ? `${other.firstName} ${other.lastName}` : 'Boma Yangu'}
                            </p>
                            {other && (
                              <Badge variant="outline" size="sm">{other.role.replace(/_/g, ' ')}</Badge>
                            )}
                            {incoming && (
                              <Badge size="sm" variant={unread ? 'warning' : 'default'}>
                                {unread ? 'Unread' : 'Read'}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">{formatDateTime(message.createdAt)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-1.5">{message.subject}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{message.content}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New Message Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Message"
        subtitle="Message your landlord or estate team"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            name="receiverId"
            label="To"
            placeholder="Select a recipient"
            options={contactOptions}
            value={form.receiverId}
            onChange={(e) => handleChange('receiverId', e.target.value)}
          />
          <Input
            name="receiverEmail"
            label="or recipient email"
            placeholder="tenant@example.com or landlord@example.com"
            value={form.receiverEmail}
            onChange={(e) => handleChange('receiverEmail', e.target.value)}
          />
          <Input
            name="subject"
            label="Subject"
            placeholder="What is this about?"
            required
            value={form.subject}
            onChange={(e) => handleChange('subject', e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Message <span className="text-red-500 ml-1">*</span>
            </label>
            <textarea
              name="content"
              required
              rows={4}
              placeholder="Write your message..."
              value={form.content}
              onChange={(e) => handleChange('content', e.target.value)}
              className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e2b714] focus-visible:border-transparent transition-all duration-200"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              <Send className="w-4 h-4 mr-2" />
              Send Message
            </Button>
          </div>
        </form>
      </Modal>
      <SendMailModal open={mailOpen} onClose={() => setMailOpen(false)} />
    </DashboardLayout>
  );
}
