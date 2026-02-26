import { useMemo, type ReactNode } from 'react';
import snapshotRaw from '../data/odoo-projects.json';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type AtRiskValue = 'Yes' | 'No';
type BoardColumnKey = 'open' | 'progress' | 'completed' | 'atRisk';
type MarketFilter = 'all' | 'UAE' | 'KSA';

const snapshot = snapshotRaw as OdooSnapshot;
const baseRows: ProjectRow[] = snapshot.rows ?? [];
const atRiskStorageKey = 'main-view-at-risk-state-v1';

const toPlainText = (value: string) =>
  value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

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

export function BoardView({ viewSwitcher, marketFilter = 'all' }: { viewSwitcher?: ReactNode; marketFilter?: MarketFilter }) {
  const marketRows = useMemo(() => baseRows.filter((row) => matchesMarket(row, marketFilter)), [marketFilter]);

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
    const buckets: Record<BoardColumnKey, ProjectRow[]> = {
      open: [],
      progress: [],
      completed: [],
      atRisk: [],
    };

    for (const row of marketRows) {
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

    return buckets;
  }, [marketRows, persistedAtRiskState]);

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <AppShell
      wide
      title="Board View"
      description="Four-column board: Open/New, In Progress, Completed, and At Risk."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {marketRows.length} tasks
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
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">
                  {grouped[column.key].length}
                </span>
              </div>
            </header>

            <div className="max-h-[calc(100vh-190px)] space-y-2 overflow-y-auto p-3">
              {grouped[column.key].map((row) => (
                <article key={`${column.key}-${row.taskId}`} className="rounded-lg border border-white/70 bg-white p-3 shadow-sm">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.taskName}</p>
                  <p className="truncate text-xs text-slate-500">{row.accountName ?? 'TBD'}</p>
                  <p className="mt-2 text-xs text-slate-600">
                    {formatDate(row.startDate)} → {formatDate(row.endDate)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {row.description ? toPlainText(row.description) : 'No description'}
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
