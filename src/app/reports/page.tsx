'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatCurrency, formatDate, formatPercentage } from '@/lib/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import {
  BarChart3, Download, RefreshCw, Wallet, TrendingUp, Building2, Wrench,
  Users, AlertTriangle, Inbox, ShieldAlert, Percent,
} from 'lucide-react';

interface TrendPoint {
  label: string;
  year: number;
  month: number;
  amount: number;
}

interface PropertyRow {
  id: string;
  name: string;
  city?: string | null;
  units: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
  revenue: number;
  outstanding: number;
  tenants: number;
}

interface LedgerRow {
  paymentDate: string;
  amount: number;
  status: string;
  method: string;
  receiptNumber?: string | null;
  tenant?: string | null;
  unit?: string | null;
  property?: string | null;
}

interface ReportData {
  period: { key: string; from: string; to: string };
  summary: {
    revenue: number;
    paymentCount: number;
    billed: number;
    collectionRate: number | null;
    outstanding: number;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
    activeTenants: number;
    openRequests: number;
    urgentOpen: number;
    maintenanceTotal: number;
  };
  trend: TrendPoint[];
  methods: { method: string; count: number; amount: number }[];
  maintenance: { byStatus: Record<string, number>; total: number };
  properties: PropertyRow[];
  ledger: LedgerRow[];
}

const PERIOD_OPTIONS = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'Last 3 months' },
  { value: 'year', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

const METHOD_LABELS: Record<string, string> = {
  MPESA_STK_PUSH: 'M-Pesa STK Push',
  MPESA_PAY_LINK: 'M-Pesa Pay Link',
  MPESA_PAYBILL: 'M-Pesa Paybill',
  MPESA_TILL_NUMBER: 'M-Pesa Till',
  BANK_TRANSFER: 'Bank Transfer',
  CASH: 'Cash',
};

const STATUS_LABELS: Record<string, string> = {
  REPORTED: 'Reported',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  REPORTED: 'bg-blue-500',
  ASSIGNED: 'bg-sky-500',
  IN_PROGRESS: 'bg-amber-500',
  COMPLETED: 'bg-emerald-500',
  CANCELLED: 'bg-gray-400',
};

/** RFC-style CSV escaping: quote anything with a comma, quote or newline. */
function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(',')
    )
    .join('\n');
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isTenant = user?.role === UserRole.TENANT;

  const [period, setPeriod] = useState('year');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?period=${encodeURIComponent(period)}`);
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load report');
      setReport(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    // Wait for the signed-in user: tenants are shown a notice instead.
    if (!user || user.role === UserRole.TENANT) return;
    fetchReport();
  }, [fetchReport, user]);

  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const s = report.summary;
      const rows: (string | number | null)[][] = [
        ['Boma Yangu Report'],
        ['Period', `${formatDate(report.period.from)} — ${formatDate(report.period.to)}`],
        ['Generated', new Date().toISOString()],
        [],
        ['SUMMARY'],
        ['Metric', 'Value'],
        ['Revenue collected (KES)', s.revenue],
        ['Payments received', s.paymentCount],
        ['Rent billed (KES)', s.billed],
        ['Collection rate (%)', s.collectionRate === null ? 'n/a' : s.collectionRate.toFixed(1)],
        ['Outstanding balances (KES)', s.outstanding],
        ['Units', s.totalUnits],
        ['Occupied units', s.occupiedUnits],
        ['Vacant units', s.vacantUnits],
        ['Occupancy rate (%)', s.occupancyRate.toFixed(1)],
        ['Active tenants', s.activeTenants],
        ['Open maintenance requests', s.openRequests],
        [],
        ['PROPERTY PERFORMANCE'],
        ['Property', 'City', 'Units', 'Occupied', 'Vacant', 'Occupancy %', 'Revenue (KES)', 'Outstanding (KES)', 'Tenants'],
        ...report.properties.map((p) => [
          p.name,
          p.city || '',
          p.units,
          p.occupied,
          p.vacant,
          p.occupancyRate.toFixed(1),
          p.revenue,
          p.outstanding,
          p.tenants,
        ]),
        [],
        ['PAYMENT LEDGER'],
        ['Date', 'Tenant', 'Unit', 'Property', 'Method', 'Status', 'Amount (KES)', 'Receipt'],
        ...report.ledger.map((row) => [
          row.paymentDate,
          row.tenant || '',
          row.unit || '',
          row.property || '',
          METHOD_LABELS[row.method] || row.method,
          row.status,
          row.amount,
          row.receiptNumber || '',
        ]),
      ];

      const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `boma-yangu-report-${report.period.key}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch {
      toast.error('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary;
  const maxTrend = Math.max(...(report?.trend.map((t) => t.amount) || [0]), 1);
  const maxMethod = Math.max(...(report?.methods.map((m) => m.amount) || [0]), 1);
  const maxStatus = Math.max(
    ...(report ? Object.values(report.maintenance.byStatus) : [0]),
    1
  );

  const kpis = summary
    ? [
        {
          label: 'Revenue collected',
          value: formatCurrency(summary.revenue),
          hint: `${summary.paymentCount} payment${summary.paymentCount === 1 ? '' : 's'} in period`,
          icon: Wallet,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
        },
        {
          label: 'Collection rate',
          value: summary.collectionRate === null ? '—' : formatPercentage(summary.collectionRate),
          hint: summary.billed > 0 ? `${formatCurrency(summary.billed)} billed` : 'No rent billed in period',
          icon: Percent,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
        },
        {
          label: 'Outstanding balances',
          value: formatCurrency(summary.outstanding),
          hint: 'Unpaid invoice balances',
          icon: AlertTriangle,
          color: 'text-red-600',
          bg: 'bg-red-50',
        },
        {
          label: 'Occupancy',
          value: formatPercentage(summary.occupancyRate),
          hint: `${summary.occupiedUnits} of ${summary.totalUnits} units occupied`,
          icon: Building2,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
        },
      ]
    : [];

  if (isTenant) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="p-12 text-center text-gray-400">
            <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-gray-600 font-medium">Reports are for property management</p>
            <p className="text-sm mt-1">Your landlord sees estate-wide reports here.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-500 mt-1">Revenue, occupancy and maintenance across your properties</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select
                name="period"
                aria-label="Report period"
                options={PERIOD_OPTIONS}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <button
              onClick={fetchReport}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a3e] text-xs text-[#a0a0a0] hover:bg-[#e2b714]/5 hover:text-[#d4d4d4] transition-all duration-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={!report || exporting} loading={exporting}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {loading && !report ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-gray-100 rounded-xl" />
              ))}
            </div>
            <div className="h-72 bg-gray-100 rounded-xl" />
            <div className="h-64 bg-gray-100 rounded-xl" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-400">{error}</CardContent>
          </Card>
        ) : !report || report.properties.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-gray-600 font-medium">No properties to report on yet</p>
              <p className="text-sm mt-1">Add a property and start recording payments to see your reports.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {kpis.map((kpi) => (
                <Card key={kpi.label}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                        <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                      </div>
                      <span className="text-xs text-gray-400">
                        {PERIOD_OPTIONS.find((o) => o.value === period)?.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{kpi.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{kpi.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Rent collected, last 12 months */}
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Rent collected
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Last 12 months, all payment methods</p>
                  </div>
                  <Badge variant="success">{formatCurrency(report.trend.reduce((s, t) => s + t.amount, 0))}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1.5 sm:gap-2 h-48">
                    {report.trend.map((point) => (
                      <div key={`${point.year}-${point.month}`} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                        <div
                          className="w-full h-40 flex items-end"
                          title={`${point.label} ${point.year}: ${formatCurrency(point.amount)}`}
                        >
                          <div
                            className="w-full rounded-t-md bg-gradient-to-t from-[#e2b714] to-[#f0cf4e] transition-all duration-500"
                            style={{
                              height: `${Math.max((point.amount / maxTrend) * 100, point.amount > 0 ? 3 : 0)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">{point.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Payment methods */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-blue-600" />
                    Payment methods
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    {PERIOD_OPTIONS.find((o) => o.value === period)?.label}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.methods.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No completed payments in this period</p>
                  ) : (
                    report.methods.map((method) => (
                      <div key={method.method}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-gray-700">{METHOD_LABELS[method.method] || method.method}</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(method.amount)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.max((method.amount / maxMethod) * 100, 3)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">{method.count} payment{method.count === 1 ? '' : 's'}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Occupancy by property */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    Occupancy by property
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    {summary?.occupiedUnits} occupied • {summary?.vacantUnits} vacant
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.properties.map((property) => (
                    <div key={property.id}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-gray-700 truncate mr-2">{property.name}</span>
                        <span className="text-gray-500 whitespace-nowrap">
                          {property.occupied}/{property.units} • {formatPercentage(property.occupancyRate)}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${Math.max(property.occupancyRate, property.occupied > 0 ? 2 : 0)}%` }}
                        />
                        <div className="h-full bg-amber-300 flex-1" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Maintenance */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-600" />
                      Maintenance requests
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Last 12 months</p>
                  </div>
                  <Badge variant={summary && summary.openRequests > 0 ? 'warning' : 'success'}>
                    {summary?.openRequests ?? 0} open
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-red-50">
                      <div className="flex items-center gap-1.5 text-red-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="text-xs">Urgent open</span>
                      </div>
                      <p className="text-xl font-bold text-red-700 mt-1">{summary?.urgentOpen ?? 0}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Inbox className="w-3.5 h-3.5" />
                        <span className="text-xs">Total raised</span>
                      </div>
                      <p className="text-xl font-bold text-gray-700 mt-1">{report.maintenance.total}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(report.maintenance.byStatus).map(([status, count]) => (
                      <div key={status}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-gray-700">{STATUS_LABELS[status] || status}</span>
                          <span className="font-semibold text-gray-900">{count}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${STATUS_COLORS[status] || 'bg-gray-400'}`}
                            style={{ width: `${Math.max((count / maxStatus) * 100, count > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Property performance table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    Property performance
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Ranked by revenue • {PERIOD_OPTIONS.find((o) => o.value === period)?.label}
                  </p>
                </div>
                <Badge variant="outline">
                  <Users className="w-3 h-3 mr-1" />
                  {summary?.activeTenants ?? 0} tenants
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="py-2 pr-4 font-medium">Property</th>
                        <th className="py-2 pr-4 font-medium">Units</th>
                        <th className="py-2 pr-4 font-medium">Occupied</th>
                        <th className="py-2 pr-4 font-medium">Vacancy</th>
                        <th className="py-2 pr-4 font-medium">Tenants</th>
                        <th className="py-2 pr-4 font-medium text-right">Revenue</th>
                        <th className="py-2 font-medium text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.properties.map((property) => (
                        <tr key={property.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-gray-900">{property.name}</p>
                            {property.city && <p className="text-xs text-gray-400">{property.city}</p>}
                          </td>
                          <td className="py-3 pr-4 text-gray-600">{property.units}</td>
                          <td className="py-3 pr-4 text-gray-600">{property.occupied}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={property.occupancyRate >= 80 ? 'success' : property.occupancyRate >= 50 ? 'warning' : 'danger'} size="sm">
                              {formatPercentage(property.occupancyRate)}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-gray-600">{property.tenants}</td>
                          <td className="py-3 pr-4 text-right font-semibold text-gray-900">
                            {formatCurrency(property.revenue)}
                          </td>
                          <td className="py-3 text-right text-red-600">{formatCurrency(property.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-100 font-semibold text-gray-900">
                        <td className="py-3 pr-4">Total</td>
                        <td className="py-3 pr-4">{summary?.totalUnits ?? 0}</td>
                        <td className="py-3 pr-4">{summary?.occupiedUnits ?? 0}</td>
                        <td className="py-3 pr-4">{summary ? formatPercentage(summary.occupancyRate) : '—'}</td>
                        <td className="py-3 pr-4">{summary?.activeTenants ?? 0}</td>
                        <td className="py-3 pr-4 text-right">{formatCurrency(summary?.revenue ?? 0)}</td>
                        <td className="py-3 text-right text-red-600">{formatCurrency(summary?.outstanding ?? 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
