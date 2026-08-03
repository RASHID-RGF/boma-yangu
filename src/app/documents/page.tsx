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
import { formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  FolderOpen, FileText, FileSignature, File, Download, RefreshCw, ShieldCheck,
  Receipt, Plus, ExternalLink,
} from 'lucide-react';

interface DocumentRow {
  id: string;
  name: string;
  type: string;
  url: string;
  createdAt: string;
  uploadedBy?: { firstName: string; lastName: string } | null;
  property?: { name: string } | null;
}

interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
  unit?: { unitNumber: string } | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  LEASE: <FileSignature className="w-4 h-4" />,
  INVOICE: <FileText className="w-4 h-4" />,
  RECEIPT: <Receipt className="w-4 h-4" />,
  ID: <ShieldCheck className="w-4 h-4" />,
  KRA: <ShieldCheck className="w-4 h-4" />,
  OTHER: <File className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  LEASE: 'bg-blue-50 text-blue-600',
  INVOICE: 'bg-emerald-50 text-emerald-600',
  RECEIPT: 'bg-amber-50 text-amber-600',
  ID: 'bg-purple-50 text-purple-600',
  KRA: 'bg-purple-50 text-purple-600',
  OTHER: 'bg-gray-100 text-gray-600',
};

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'LEASE', label: 'Lease Agreement' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'ID', label: 'ID / Passport' },
  { value: 'KRA', label: 'KRA PIN' },
  { value: 'OTHER', label: 'Other' },
];

const EMPTY_FORM = { name: '', type: 'OTHER', url: '', tenantId: '' };

export default function DocumentsPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [stats, setStats] = useState<{ count: number; byType: Record<string, number> }>({ count: 0, byType: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Document modal
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents');
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load documents');
      setDocuments(result.data);
      setStats(result.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const openAddModal = useCallback(async () => {
    setAddOpen(true);
    setForm(EMPTY_FORM);
    if (isManagement) {
      try {
        const res = await fetch('/api/tenants');
        const result = await res.json();
        if (res.ok && result.success) setTenants(result.data || []);
      } catch {
        // tenant list is optional for adding a document
      }
    }
  }, [isManagement]);

  const setFormField = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          url: form.url || undefined,
          tenantId: form.tenantId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to add document');
      toast.success('Document added');
      setAddOpen(false);
      await fetchDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
      setSubmitting(false);
    }
  };

  const tenantOptions = tenants.map((t) => ({
    value: t.id,
    label: `${t.firstName} ${t.lastName} — Unit ${t.unit?.unitNumber || 'N/A'}`,
  }));

  const typeEntries = Object.entries(stats.byType);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <p className="text-gray-500 mt-1">{isManagement ? 'All documents on file' : 'Your leases, IDs and official documents'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDocuments}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <Button className="gap-2" onClick={openAddModal}>
              <Plus className="w-4 h-4" />
              Add Document
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <FolderOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Documents</p>
                <p className="text-xl font-bold text-gray-900">{stats.count}</p>
              </div>
            </CardContent>
          </Card>
          {typeEntries.slice(0, 2).map(([type, count]) => (
            <Card key={type}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-600'}`}>
                  {TYPE_ICONS[type] || <File className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{type} Documents</p>
                  <p className="text-xl font-bold text-gray-900">{count}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No documents on file yet</p>
              <Button variant="outline" className="mt-4" onClick={openAddModal}>
                <Plus className="w-4 h-4 mr-2" />
                Add the first document
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <Card key={doc.id} className="card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2.5 rounded-xl ${TYPE_COLORS[doc.type] || 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_ICONS[doc.type] || <File className="w-4 h-4" />}
                    </div>
                    <Badge variant="outline">{doc.type}</Badge>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate" title={doc.name}>{doc.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : 'Boma Yangu'} • {formatDate(doc.createdAt)}
                  </p>
                  {doc.property && <p className="text-xs text-gray-400 mt-0.5">{doc.property.name}</p>}
                  {doc.url && doc.url !== '#' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      asChild
                    >
                      <a href={doc.url} target="_blank" rel="noreferrer">
                        <Download className="w-3.5 h-3.5 mr-2" />
                        View Document
                      </a>
                    </Button>
                  ) : (
                    <p className="w-full mt-4 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      No link attached yet
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Document Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a Document"
        subtitle={isManagement ? 'Record a document on file for a tenant' : 'Add a document to your profile'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            name="name"
            label="Document Name"
            placeholder="e.g. Lease Agreement, National ID"
            required
            value={form.name}
            onChange={(e) => setFormField('name', e.target.value)}
          />
          <Select
            name="type"
            label="Document Type"
            options={DOCUMENT_TYPE_OPTIONS}
            value={form.type}
            onChange={(e) => setFormField('type', e.target.value)}
          />
          {isManagement && (
            <Select
              name="tenantId"
              label="Tenant (optional)"
              placeholder="No specific tenant"
              options={tenantOptions}
              value={form.tenantId}
              onChange={(e) => setFormField('tenantId', e.target.value)}
            />
          )}
          <Input
            name="url"
            label="Document Link (optional)"
            placeholder="https://drive.google.com/..."
            value={form.url}
            onChange={(e) => setFormField('url', e.target.value)}
          />
          <p className="text-xs text-[#646669]">
            Add a link to the file (e.g. Google Drive or Cloudinary). If you leave it empty the
            document is still saved to your records and the link can be added later.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              <Plus className="w-4 h-4 mr-2" />
              Add Document
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
