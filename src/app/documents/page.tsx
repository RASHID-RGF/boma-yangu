'use client';

import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { FolderOpen, FileText, FileSignature, File, Download, RefreshCw, ShieldCheck, Receipt } from 'lucide-react';

interface DocumentRow {
  id: string;
  name: string;
  type: string;
  url: string;
  createdAt: string;
  uploadedBy?: { firstName: string; lastName: string } | null;
  property?: { name: string } | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  LEASE: <FileSignature className="w-4 h-4" />,
  INVOICE: <FileText className="w-4 h-4" />,
  RECEIPT: <Receipt className="w-4 h-4" />,
  ID: <ShieldCheck className="w-4 h-4" />,
  KRA: <ShieldCheck className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  LEASE: 'bg-blue-50 text-blue-600',
  INVOICE: 'bg-emerald-50 text-emerald-600',
  RECEIPT: 'bg-amber-50 text-amber-600',
  ID: 'bg-purple-50 text-purple-600',
  KRA: 'bg-purple-50 text-purple-600',
};

export default function DocumentsPage() {
  const { user } = useAuth();
  const isManagement = !!user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LANDLORD || user.role === UserRole.MANAGER);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [stats, setStats] = useState<{ count: number; byType: Record<string, number> }>({ count: 0, byType: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const typeEntries = Object.entries(stats.byType);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <p className="text-gray-500 mt-1">{isManagement ? 'All documents on file' : 'Your leases, IDs and official documents'}</p>
          </div>
          <button
            onClick={fetchDocuments}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    asChild
                  >
                    <a href={doc.url || '#'} target="_blank" rel="noreferrer">
                      <Download className="w-3.5 h-3.5 mr-2" />
                      View Document
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
