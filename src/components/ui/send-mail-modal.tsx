'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MessageSquare, Send } from 'lucide-react';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface SendMessageModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the recipient (e.g. when replying to a specific person). */
  defaultReceiverId?: string;
  /** Pre-fill the subject line. */
  defaultSubject?: string;
}

export function SendMessageModal({
  open,
  onClose,
  defaultReceiverId = '',
  defaultSubject = '',
}: SendMessageModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState(defaultReceiverId);
  const [receiverEmail, setReceiverEmail] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactFilter, setContactFilter] = useState<'ALL' | 'LANDLORD' | 'TENANT'>('ALL');

  // Load contacts from the messages API (same source as the messages page).
  useEffect(() => {
    if (!open) return;
    setReceiverId(defaultReceiverId);
    setSubject(defaultSubject);
    setMessage('');
    setLoadingContacts(true);
    fetch('/api/messages')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setContacts(result.contacts || []);
          setContactsNote(result.contactsNote || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingContacts(false));
  }, [open, defaultReceiverId, defaultSubject]);

  const filteredContacts = contacts.filter((c) =>
    contactFilter === 'ALL' ? true : contactFilter === 'LANDLORD' ? c.role === 'LANDLORD' || c.role === 'SUPER_ADMIN' : c.role === 'TENANT'
  );

  const contactOptions = filteredContacts.map((c) => ({
    value: c.id,
    label: `${c.firstName} ${c.lastName} (${c.role.replace(/_/g, ' ')})`,
  }));

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverId && !receiverEmail.trim()) {
      toast.error('Select a recipient or enter an email');
      return;
    }
    if (!subject.trim()) {
      toast.error('Enter a subject');
      return;
    }
    if (!message.trim()) {
      toast.error('Enter a message');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: receiverId || undefined,
          receiverEmail: receiverId ? undefined : receiverEmail.trim(),
          subject: subject.trim(),
          content: message.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
      toast.success('Message sent');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Message"
      subtitle="Send a message to the landlord or tenant"
    >
      <form onSubmit={handleSend} className="space-y-4">
        <Select
          name="receiverId"
          label="To"
          placeholder={
            loadingContacts
              ? 'Loading contacts...'
              : contacts.length === 0
                ? 'No contacts available'
                : 'Select a recipient'
          }
          options={contactOptions}
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
        />
        {!loadingContacts && contacts.length === 0 && (
          <p className="text-xs text-amber-500/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
            {contactsNote || 'No contacts available yet.'}
          </p>
        )}
        {contacts.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500">Filter:</div>
              <div className="inline-flex rounded-lg overflow-hidden border border-border">
                <button
                  type="button"
                  onClick={() => setContactFilter('ALL')}
                  className={`px-3 py-1 text-xs ${contactFilter === 'ALL' ? 'bg-[#e2b714]/10 text-[#e2b714]' : 'bg-white text-gray-600'}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setContactFilter('LANDLORD')}
                  className={`px-3 py-1 text-xs ${contactFilter === 'LANDLORD' ? 'bg-[#e2b714]/10 text-[#e2b714]' : 'bg-white text-gray-600'}`}
                >
                  Landlords
                </button>
                <button
                  type="button"
                  onClick={() => setContactFilter('TENANT')}
                  className={`px-3 py-1 text-xs ${contactFilter === 'TENANT' ? 'bg-[#e2b714]/10 text-[#e2b714]' : 'bg-white text-gray-600'}`}
                >
                  Tenants
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {filteredContacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setReceiverId(c.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    receiverId === c.id
                      ? 'bg-[#e2b714]/10 text-[#e2b714] border border-[#e2b714]/30'
                      : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      c.role === 'LANDLORD' || c.role === 'SUPER_ADMIN' ? 'bg-blue-500' : 'bg-emerald-500'
                    }`}
                  />
                  {c.firstName} {c.lastName}
                  <span className="text-[10px] opacity-60">
                    ({c.role === 'LANDLORD' || c.role === 'SUPER_ADMIN' ? 'Landlord' : 'Tenant'})
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {/* Manual email input fallback */}
        <Input
          name="receiverEmail"
          label="Or enter recipient email"
          placeholder="someone@example.com"
          value={receiverEmail}
          onChange={(e) => setReceiverId('') || setReceiverEmail(e.target.value)}
        />
        <Input
          name="subject"
          label="Subject"
          placeholder="e.g. Rent reminder, Maintenance update..."
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Message <span className="text-red-500 ml-1">*</span>
          </label>
          <textarea
            className="flex min-h-[120px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e2b714] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <p className="text-xs text-[#646669]">
          The recipient will see this message in their Messages dashboard and receive
          an email notification.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={sending} className="gap-2">
            <Send className="w-4 h-4" />
            Send Message
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Re-export the old name so existing imports don't break during migration.
 * New code should import SendMessageModal directly.
 */
export const SendMailModal = SendMessageModal;
