'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Send, User } from 'lucide-react';

interface SendMailModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the recipient email (e.g. when clicking from a tenant card). */
  defaultTo?: string;
  /** Pre-fill the subject line. */
  defaultSubject?: string;
}

export function SendMailModal({
  open,
  onClose,
  defaultTo = '',
  defaultSubject = '',
}: SendMailModalProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reset fields when the modal opens with new defaults.
  const handleOpen = useCallback(() => {
    setTo(defaultTo);
    setSubject(defaultSubject);
    setMessage('');
  }, [defaultTo, defaultSubject]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) {
      toast.error('Enter a recipient email');
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
      // Resolve the recipient user by email, then send via the messages API.
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverEmail: to.trim(),
          subject: subject.trim(),
          content: message.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to send email');
      }
      toast.success('Email sent successfully');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Email"
      subtitle="Send an email notification to a landlord or tenant"
    >
      <form onSubmit={handleSend} className="space-y-4">
        <Input
          name="to"
          label="Recipient Email"
          type="email"
          placeholder="e.g. tenant@example.com"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          icon={<Mail className="w-4 h-4" />}
        />
        <Input
          name="subject"
          label="Subject"
          placeholder="e.g. Rent reminder, Maintenance update..."
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          icon={<User className="w-4 h-4" />}
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
          The recipient will receive an email notification with this message and
          a notification in their Boma Yangu dashboard.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={sending} className="gap-2">
            <Send className="w-4 h-4" />
            Send Email
          </Button>
        </div>
      </form>
    </Modal>
  );
}
