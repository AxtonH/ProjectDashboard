import { useMemo, useState, type ReactNode } from 'react';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type AtRiskValue = 'Yes' | 'No';
type BoardColumnKey = 'open' | 'progress' | 'completed' | 'atRisk';
type MarketFilter = 'all' | 'UAE' | 'KSA';
type SalesOrderKey = string;

const atRiskStorageKey = 'main-view-at-risk-state-v1';

const formatCurrencyAed = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);

const columns: Array<{
  key: BoardColumnKey;
  label: string;
  headerClass: string;
  bodyClass: string;
}> = [
  {
    key: 'open',
    label: 'Open / New',
    headerClass: 'bg-sky-200 text-sky-900 border-sky-300',
    bodyClass: 'bg-sky-50 border-sky-200',
  },
  {
    key: 'progress',
    label: 'In Progress',
    headerClass: 'bg-amber-200 text-amber-900 border-amber-300',
    bodyClass: 'bg-amber-50 border-amber-200',
  },
  {
    key: 'completed',
    label: 'Completed',
    headerClass: 'bg-emerald-200 text-emerald-900 border-emerald-300',
    bodyClass: 'bg-emerald-50 border-emerald-200',
  },
  {
    key: 'atRisk',
    label: 'At Risk',
    headerClass: 'bg-rose-200 text-rose-900 border-rose-300',
    bodyClass: 'bg-rose-50 border-rose-200',
  },
];

function classifyRow(statusName: string | null | undefined, atRisk: boolean): BoardColumnKey {
  if (atRisk) return 'atRisk';
  const value = (statusName ?? '').toLowerCase();
  if (value.includes('complete') || value.includes('done')) return 'completed';
  if (value.includes('progress') || value.includes('review') || value.includes('feedback')) return 'progress';
  return 'open';
}

type FilterOption = { label: string; value: string };

function FilterChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[#e2e6ef] bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
      <span className="uppercase tracking-[0.25em] text-[0.6rem] text-slate-400">{label}</span>
      <select
        className="bg-transparent text-slate-700 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDate(value: string | null) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

const matchesMarket = (row: ProjectRow, marketFilter: MarketFilter) => {
  if (marketFilter === 'all') return true;
  const market = (row.market ?? '').trim().toUpperCase();
  return market.includes(marketFilter);
};

const isCanceledStatus = (statusName: string | null | undefined) => {
  const value = (statusName ?? '').toLowerCase();
  return value.includes('cancel');
};

const isCompletedStatus = (statusName: string | null | undefined) => {
  const value = (statusName ?? '').toLowerCase();
  return value.includes('complete') || value.includes('done');
};

const isCanceledSalesOrder = (row: ProjectRow) => {
  const value = (row.saleOrderState ?? '').trim().toLowerCase();
  return value.includes('cancel');
};

const parseTime = (value: string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const shouldIncludeCompletedRow = (row: ProjectRow, now: number) => {
  if (!isCompletedStatus(row.status?.name)) {
    return true;
  }

  const completionTime =
    parseTime(row.submissionDate) ??
    parseTime(row.endDate) ??
    parseTime(row.clientDueDate) ??
    parseTime(row.startDate);

  if (completionTime === null) {
    return true;
  }

  const ageMs = now - completionTime;
  const days60Ms = 60 * 24 * 60 * 60 * 1000;
  if (ageMs <= days60Ms) {
    return true;
  }

  const invoiceStatus = row.invoice?.status ?? 'not_invoiced';
  return invoiceStatus !== 'invoiced';
};

export function BoardView({
  snapshot,
  viewSwitcher,
  marketFilter = 'all',
}: {
  snapshot: OdooSnapshot;
  viewSwitcher?: ReactNode;
  marketFilter?: MarketFilter;
}) {
  const baseRows: ProjectRow[] = snapshot.rows ?? [];
  const [statusFilter, setStatusFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const marketRows = useMemo(
    () => baseRows.filter((row) => matchesMarket(row, marketFilter) && !isCanceledStatus(row.status?.name)),
    [baseRows, marketFilter],
  );

  const statusOptions = useMemo<FilterOption[]>(
    () => [
      { label: 'All', value: 'all' },
      ...Array.from(
        new Set(
          marketRows
            .map((row) => row.status?.name ?? '—')
            .filter(Boolean),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
    ],
    [marketRows],
  );

  const invoiceOptions = useMemo<FilterOption[]>(
    () => [
      { label: 'All', value: 'all' },
      ...Array.from(
        new Set(
          marketRows.map((row) => row.invoice?.statusLabel ?? 'No sales order'),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
    ],
    [marketRows],
  );

  const paymentOptions = useMemo<FilterOption[]>(
    () => [
      { label: 'All', value: 'all' },
      ...Array.from(
        new Set(
          marketRows.map((row) => row.payment?.statusLabel ?? 'No Invoice'),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
    ],
    [marketRows],
  );

  const persistedAtRiskState = useMemo<Record<number, AtRiskValue>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = window.localStorage.getItem(atRiskStorageKey);
      if (!saved) return {};
      const parsed = JSON.parse(saved) as Record<string, AtRiskValue>;
      const result: Record<number, AtRiskValue> = {};
      for (const [taskId, value] of Object.entries(parsed)) {
        if (value === 'Yes' || value === 'No') {
          result[Number(taskId)] = value;
        }
      }
      return result;
    } catch {
      return {};
    }
  }, []);

  const grouped = useMemo(() => {
    const now = Date.now();
    const buckets: Record<BoardColumnKey, ProjectRow[]> = {
      open: [],
      progress: [],
      completed: [],
      atRisk: [],
    };

    for (const row of marketRows) {
      if (isCanceledStatus(row.status?.name) || isCanceledSalesOrder(row)) {
        continue;
      }
      if (!shouldIncludeCompletedRow(row, now)) {
        continue;
      }
      const rowStatus = row.status?.name ?? '—';
      const rowInvoice = row.invoice?.statusLabel ?? 'No sales order';
      const rowPayment = row.payment?.statusLabel ?? 'No Invoice';
      if (statusFilter !== 'all' && rowStatus !== statusFilter) {
        continue;
      }
      if (invoiceFilter !== 'all' && rowInvoice !== invoiceFilter) {
        continue;
      }
      if (paymentFilter !== 'all' && rowPayment !== paymentFilter) {
        continue;
      }
      const atRisk = (persistedAtRiskState[row.taskId] ?? 'No') === 'Yes';
      const key = classifyRow(row.status?.name, atRisk);
      buckets[key].push(row);
    }

    const sortByRecent = (a: ProjectRow, b: ProjectRow) => {
      const timeA = a.submissionDate ? new Date(a.submissionDate).getTime() : a.taskId;
      const timeB = b.submissionDate ? new Date(b.submissionDate).getTime() : b.taskId;
      return timeB - timeA;
    };

    for (const key of Object.keys(buckets) as BoardColumnKey[]) {
      buckets[key].sort(sortByRecent);
    }

    const amountToInvoiceByColumn: Record<BoardColumnKey, number> = {
      open: 0,
      progress: 0,
      completed: 0,
      atRisk: 0,
    };
    const uniqueSalesOrdersByColumn: Record<BoardColumnKey, number> = {
      open: 0,
      progress: 0,
      completed: 0,
      atRisk: 0,
    };
    const seenSalesOrdersGlobal = new Set<SalesOrderKey>();
    for (const key of Object.keys(buckets) as BoardColumnKey[]) {
      const seenSalesOrders = new Set<SalesOrderKey>();
      let columnAmount = 0;
      for (const row of buckets[key]) {
        columnAmount += Number(row.amountToInvoiceAed ?? 0);
        const soKey = row.invoice?.id ? String(row.invoice.id) : row.invoice?.label ? `label:${row.invoice.label}` : null;
        if (soKey) {
          seenSalesOrders.add(soKey);
          seenSalesOrdersGlobal.add(soKey);
        }
      }

      amountToInvoiceByColumn[key] = columnAmount;
      uniqueSalesOrdersByColumn[key] = seenSalesOrders.size;
    }

    return {
      buckets,
      amountToInvoiceByColumn,
      uniqueSalesOrdersByColumn,
      uniqueSalesOrdersTotal: seenSalesOrdersGlobal.size,
      amountToInvoiceTotal: (
        amountToInvoiceByColumn.open +
        amountToInvoiceByColumn.progress +
        amountToInvoiceByColumn.completed +
        amountToInvoiceByColumn.atRisk
      ),
    };
  }, [marketRows, persistedAtRiskState, statusFilter, invoiceFilter, paymentFilter]);

  const displayedTaskCount = useMemo(
    () => Object.values(grouped.buckets).reduce((total, rows) => total + rows.length, 0),
    [grouped],
  );

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

  return (
    <AppShell
      wide
      title="Board View"
      description="Four-column board: Open/New, In Progress, Completed, and At Risk."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          <FilterChip label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
          <FilterChip label="Invoice" value={invoiceFilter} options={invoiceOptions} onChange={setInvoiceFilter} />
          <FilterChip label="Payment" value={paymentFilter} options={paymentOptions} onChange={setPaymentFilter} />
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {displayedTaskCount} tasks
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600">
            Unique SOs: {grouped.uniqueSalesOrdersTotal}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
            Total to invoice: {formatCurrencyAed(grouped.amountToInvoiceTotal)}
          </span>
        </div>
      }
    >
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {columns.map((column) => (
          <section key={column.key} className={`rounded-xl border ${column.bodyClass}`}>
            <header className={`sticky top-[84px] z-[5] rounded-t-xl border-b px-3 py-2 ${column.headerClass}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{column.label}</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.7rem] font-semibold">
                    To invoice (tasks): {formatCurrencyAed(grouped.amountToInvoiceByColumn[column.key])}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.7rem] font-semibold">
                    Unique SOs: {grouped.uniqueSalesOrdersByColumn[column.key]}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">
                    {grouped.buckets[column.key].length}
                  </span>
                </div>
              </div>
            </header>

            <div className="max-h-[calc(100vh-190px)] space-y-2 overflow-y-auto p-3">
              {grouped.buckets[column.key].map((row) => (
                <article key={`${column.key}-${row.taskId}`} className="rounded-lg border border-white/70 bg-white p-3 shadow-sm">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.taskName}</p>
                  <p className="truncate text-xs text-slate-500">{row.accountName ?? 'TBD'}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Sales order:{' '}
                    {row.invoice?.label ? (
                      row.invoice.label
                    ) : (
                      <span className="font-semibold text-rose-700">No sales order</span>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    {formatDate(row.startDate)} → {formatDate(row.endDate)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    Amount to invoice: {formatCurrencyAed(Number(row.amountToInvoiceAed ?? 0))}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </section>
    </AppShell>
  );
}
