import { useMemo, useState, type ReactNode } from 'react';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type MarketFilter = 'all' | 'UAE' | 'KSA';
type SectionKey = 'open' | 'progress' | 'completed' | 'atRisk';
type SectionDisplay = 'cards' | 'list';
type PeriodMode = 'month' | 'last30';

const sectionTone: Record<SectionKey, string> = {
  open: 'border-sky-200 bg-sky-50 text-sky-900',
  progress: 'border-amber-200 bg-amber-50 text-amber-900',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  atRisk: 'border-rose-200 bg-rose-50 text-rose-900',
};

const formatCurrencyAed = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const toTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const currentMonthValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
};

const inSelectedPeriod = (row: ProjectRow, periodMode: PeriodMode, selectedMonth: string) => {
  const requestTime = toTimestamp(row.startDate);
  if (requestTime === null) return false;

  if (periodMode === 'last30') {
    const now = new Date();
    const end = now.getTime();
    const start = end - 30 * 24 * 60 * 60 * 1000;
    return requestTime >= start && requestTime <= end;
  }

  if (!/^\d{4}-\d{2}$/.test(selectedMonth)) return true;
  const [yearText, monthText] = selectedMonth.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return true;

  const monthStart = new Date(year, monthIndex, 1).getTime();
  const nextMonthStart = new Date(year, monthIndex + 1, 1).getTime();
  return requestTime >= monthStart && requestTime < nextMonthStart;
};

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

const isProgressStatus = (statusName: string | null | undefined) => {
  const value = (statusName ?? '').toLowerCase();
  return value.includes('progress') || value.includes('review') || value.includes('feedback');
};

const isAtRisk = (row: ProjectRow) => {
  if (isCompletedStatus(row.status?.name)) return false;
  const dueTime = toTimestamp(row.endDate) ?? toTimestamp(row.clientDueDate);
  if (dueTime === null) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dueTime < todayStart;
};

const sortByMostRecentRequest = (a: ProjectRow, b: ProjectRow) => {
  const aTime = toTimestamp(a.startDate) ?? Number.NEGATIVE_INFINITY;
  const bTime = toTimestamp(b.startDate) ?? Number.NEGATIVE_INFINITY;
  return bTime - aTime;
};

function SectionViewToggle({
  value,
  onChange,
}: {
  value: SectionDisplay;
  onChange: (value: SectionDisplay) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold transition ${
          value === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        Cards
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold transition ${
          value === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        List
      </button>
    </div>
  );
}

function ProjectCard({ row }: { row: ProjectRow }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="truncate text-sm font-semibold text-slate-900">{row.taskName}</p>
      <p className="truncate text-xs text-slate-500">{row.accountName ?? '—'}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <p className="text-slate-600">Revenue: <span className="font-semibold text-slate-800">{formatCurrencyAed(Number(row.revenueAed ?? 0))}</span></p>
        <p className="text-slate-600">To invoice: <span className="font-semibold text-slate-800">{formatCurrencyAed(Number(row.amountToInvoiceAed ?? 0))}</span></p>
        <p className="text-slate-600">CS: <span className="font-semibold text-slate-800">{row.clientSuccess?.name ?? '—'}</span></p>
        <p className="text-slate-600">Request: <span className="font-semibold text-slate-800">{formatDate(row.startDate)}</span></p>
        <p className="text-slate-600">Internal due: <span className="font-semibold text-slate-800">{formatDate(row.endDate)}</span></p>
        <p className="text-slate-600">Client due: <span className="font-semibold text-slate-800">{formatDate(row.clientDueDate)}</span></p>
      </div>
    </article>
  );
}

function SectionContent({
  rows,
  displayMode,
}: {
  rows: ProjectRow[];
  displayMode: SectionDisplay;
}) {
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">No projects in this section.</p>;
  }

  if (displayMode === 'cards') {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <ProjectCard key={row.taskId} row={row} />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Project</th>
            <th className="px-3 py-2">Revenue</th>
            <th className="px-3 py-2">To Invoice</th>
            <th className="px-3 py-2">CS</th>
            <th className="px-3 py-2">Request Date</th>
            <th className="px-3 py-2">Internal Due</th>
            <th className="px-3 py-2">Client Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`list-${row.taskId}`} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-900">{row.taskName}</td>
              <td className="px-3 py-2 text-slate-700">{formatCurrencyAed(Number(row.revenueAed ?? 0))}</td>
              <td className="px-3 py-2 text-slate-700">{formatCurrencyAed(Number(row.amountToInvoiceAed ?? 0))}</td>
              <td className="px-3 py-2 text-slate-600">{row.clientSuccess?.name ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{formatDate(row.startDate)}</td>
              <td className="px-3 py-2 text-slate-600">{formatDate(row.endDate)}</td>
              <td className="px-3 py-2 text-slate-600">{formatDate(row.clientDueDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardView({
  snapshot,
  viewSwitcher,
  marketFilter = 'all',
  onOpenBoard,
}: {
  snapshot: OdooSnapshot;
  viewSwitcher?: ReactNode;
  marketFilter?: MarketFilter;
  onOpenBoard?: () => void;
}) {
  const baseRows = snapshot.rows ?? [];
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    open: false,
    progress: false,
    completed: false,
    atRisk: false,
  });
  const [displayMode, setDisplayMode] = useState<Record<SectionKey, SectionDisplay>>({
    open: 'cards',
    progress: 'cards',
    completed: 'cards',
    atRisk: 'cards',
  });

  const grouped = useMemo(() => {
    const scoped = baseRows
      .filter((row) => matchesMarket(row, marketFilter))
      .filter((row) => !isCanceledStatus(row.status?.name))
      .filter((row) => inSelectedPeriod(row, periodMode, selectedMonth))
      .sort(sortByMostRecentRequest);

    const open: ProjectRow[] = [];
    const progress: ProjectRow[] = [];
    const completed: ProjectRow[] = [];
    const atRisk: ProjectRow[] = [];

    for (const row of scoped) {
      if (isAtRisk(row)) atRisk.push(row);
      if (isCompletedStatus(row.status?.name)) {
        completed.push(row);
      } else if (isProgressStatus(row.status?.name)) {
        progress.push(row);
      } else {
        open.push(row);
      }
    }

    const totalRevenue = scoped.reduce((sum, row) => sum + Number(row.revenueAed ?? 0), 0);
    const totalAmountToInvoice = scoped.reduce((sum, row) => sum + Number(row.amountToInvoiceAed ?? 0), 0);

    return { open, progress, completed, atRisk, totalRevenue, totalAmountToInvoice };
  }, [baseRows, marketFilter, periodMode, selectedMonth]);

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
      title="Dashboard"
      description="Summary and visualization of project pipeline health."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
        </div>
      }
    >
      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Period</p>
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setPeriodMode('month')}
              className={`rounded-full px-3 py-1 text-[0.7rem] font-semibold transition ${
                periodMode === 'month' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('last30')}
              className={`rounded-full px-3 py-1 text-[0.7rem] font-semibold transition ${
                periodMode === 'last30' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Past 30 days
            </button>
          </div>
          {periodMode === 'month' ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span>Choose month</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
              />
            </label>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <article
            className={`rounded-xl border p-4 ${sectionTone.open} cursor-pointer transition hover:shadow-sm`}
            onClick={() => setExpandedSections((prev) => ({ ...prev, open: !prev.open }))}
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">New / Open</p>
            <p className="mt-2 text-3xl font-semibold">{grouped.open.length}</p>
            <p className="mt-1 text-sm">{expandedSections.open ? 'Hide' : 'Expand'}</p>
          </article>
          <article
            className={`rounded-xl border p-4 ${sectionTone.progress} cursor-pointer transition hover:shadow-sm`}
            onClick={() => setExpandedSections((prev) => ({ ...prev, progress: !prev.progress }))}
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Active (In Progress)</p>
            <p className="mt-2 text-3xl font-semibold">{grouped.progress.length}</p>
            <p className="mt-1 text-sm">{expandedSections.progress ? 'Hide' : 'Expand'}</p>
          </article>
          <article
            className={`rounded-xl border p-4 ${sectionTone.completed} cursor-pointer transition hover:shadow-sm`}
            onClick={() => setExpandedSections((prev) => ({ ...prev, completed: !prev.completed }))}
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Completed</p>
            <p className="mt-2 text-3xl font-semibold">{grouped.completed.length}</p>
            <p className="mt-1 text-sm">{expandedSections.completed ? 'Hide' : 'Expand'}</p>
          </article>
          <article
            className={`rounded-xl border p-4 ${sectionTone.atRisk} cursor-pointer transition hover:shadow-sm`}
            onClick={() => setExpandedSections((prev) => ({ ...prev, atRisk: !prev.atRisk }))}
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">At Risk</p>
            <p className="mt-2 text-3xl font-semibold">{grouped.atRisk.length}</p>
            <p className="mt-1 text-sm">{expandedSections.atRisk ? 'Hide' : 'Expand'}</p>
          </article>
          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Total Revenue</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrencyAed(grouped.totalRevenue)}</p>
          </article>
          <button
            type="button"
            onClick={onOpenBoard}
            className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-left text-indigo-900 transition hover:shadow-sm"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Total Amount To Invoice</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrencyAed(grouped.totalAmountToInvoice)}</p>
            <p className="mt-1 text-sm">Click to open Board</p>
          </button>
        </div>

        {expandedSections.progress ? (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Active (In Progress)</h2>
              <SectionViewToggle
                value={displayMode.progress}
                onChange={(mode) => setDisplayMode((prev) => ({ ...prev, progress: mode }))}
              />
            </header>
            <SectionContent rows={grouped.progress} displayMode={displayMode.progress} />
          </section>
        ) : null}

        {expandedSections.open ? (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">New / Open</h2>
              <SectionViewToggle
                value={displayMode.open}
                onChange={(mode) => setDisplayMode((prev) => ({ ...prev, open: mode }))}
              />
            </header>
            <SectionContent rows={grouped.open} displayMode={displayMode.open} />
          </section>
        ) : null}

        {expandedSections.completed ? (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Completed</h2>
              <SectionViewToggle
                value={displayMode.completed}
                onChange={(mode) => setDisplayMode((prev) => ({ ...prev, completed: mode }))}
              />
            </header>
            <SectionContent rows={grouped.completed} displayMode={displayMode.completed} />
          </section>
        ) : null}

        {expandedSections.atRisk ? (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">At Risk</h2>
              <SectionViewToggle
                value={displayMode.atRisk}
                onChange={(mode) => setDisplayMode((prev) => ({ ...prev, atRisk: mode }))}
              />
            </header>
            <SectionContent rows={grouped.atRisk} displayMode={displayMode.atRisk} />
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}
