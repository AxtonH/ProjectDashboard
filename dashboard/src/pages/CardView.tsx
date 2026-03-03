import { useMemo, useState, type ReactNode } from 'react';
import snapshotRaw from '../data/odoo-projects.json';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type DaysFilter = 'all' | 'overdue' | '0-7' | '8-14' | '15+' | 'tbd';
type OverdueFilter = 'all' | 'overdue' | 'not_overdue';
type AtRiskValue = 'Yes' | 'No';
type MarketFilter = 'all' | 'UAE' | 'KSA';

const snapshot = snapshotRaw as OdooSnapshot;
const baseRows: ProjectRow[] = snapshot.rows ?? [];
const dayMs = 24 * 60 * 60 * 1000;
const cardColorPalette = ['#b7e36a', '#f5df72', '#93d5ec', '#f4a3a8', '#e5e7eb'];
const atRiskStorageKey = 'main-view-at-risk-state-v1';

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function getDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - startOfToday()) / dayMs);
}

function getSubmissionSortValue(row: ProjectRow) {
  if (row.submissionDate) {
    const time = new Date(row.submissionDate).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return row.taskId;
}

function matchesDaysFilter(daysRemaining: number | null, filter: DaysFilter) {
  if (filter === 'all') return true;
  if (filter === 'tbd') return daysRemaining === null;
  if (daysRemaining === null) return false;
  if (filter === 'overdue') return daysRemaining < 0;
  if (filter === '0-7') return daysRemaining >= 0 && daysRemaining <= 7;
  if (filter === '8-14') return daysRemaining >= 8 && daysRemaining <= 14;
  return daysRemaining >= 15;
}

function statusTone(statusName: string | null | undefined) {
  const value = (statusName ?? '').toLowerCase();
  if (value.includes('complete') || value.includes('done')) {
    return {
      pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
  }
  if (value.includes('review') || value.includes('feedback')) {
    return {
      pill: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }
  if (value.includes('progress')) {
    return {
      pill: 'bg-sky-50 text-sky-700 border border-sky-200',
    };
  }
  return {
    pill: 'bg-slate-50 text-slate-700 border border-slate-200',
  };
}

function invoiceTone(label: string) {
  const value = label.toLowerCase();
  if (value === 'invoiced') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (value.includes('50%')) return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-slate-50 text-slate-700 border border-slate-200';
}

function paymentTone(status: string | null | undefined) {
  const value = (status ?? '').toLowerCase();
  if (value === 'paid') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (value === 'in_payment') return 'bg-sky-50 text-sky-700 border border-sky-200';
  if (value === 'partial') return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (value === 'not_paid') return 'bg-rose-50 text-rose-700 border border-rose-200';
  if (value === 'reversed') return 'bg-violet-50 text-violet-700 border border-violet-200';
  return 'bg-slate-50 text-slate-700 border border-slate-200';
}

const matchesMarket = (row: ProjectRow, marketFilter: MarketFilter) => {
  if (marketFilter === 'all') return true;
  const market = (row.market ?? '').trim().toUpperCase();
  return market.includes(marketFilter);
};

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

function SearchableFilterChip({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const listId = `${label.toLowerCase()}-filter-list`;
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[#e2e6ef] bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
      <span className="uppercase tracking-[0.25em] text-[0.6rem] text-slate-400">{label}</span>
      <input
        list={listId}
        className="w-[170px] bg-transparent text-slate-700 placeholder:text-slate-400 focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}

export function CardView({ viewSwitcher, marketFilter = 'all' }: { viewSwitcher?: ReactNode; marketFilter?: MarketFilter }) {
  const [designerFilter, setDesignerFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState<DaysFilter>('all');
  const [overdueFilter, setOverdueFilter] = useState<OverdueFilter>('all');
  const [addedSort, setAddedSort] = useState<'recent' | 'oldest'>('recent');
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
  const marketRows = useMemo(() => baseRows.filter((row) => matchesMarket(row, marketFilter)), [marketFilter]);

  const designerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          marketRows
            .flatMap((row) => {
              const names = (row.designers ?? []).map((person) => person.name);
              if (names.length > 0) return names;
              return row.designer ? [row.designer.name] : [];
            }),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [marketRows],
  );

  const accountOptions = useMemo<FilterOption[]>(
    () => [
      { label: 'All', value: 'all' },
      ...Array.from(
        new Map(
          marketRows
            .filter((row) => row.accountName)
            .map((row) => [String(row.accountName), String(row.accountName)]),
        ),
      ).map(([value, label]) => ({ value, label })),
    ],
    [marketRows],
  );

  const stageOptions = useMemo<FilterOption[]>(
    () => [
      { label: 'All', value: 'all' },
      ...Array.from(
        new Set(marketRows.map((row) => row.status?.name?.trim() || 'Not Started')),
      )
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
    ],
    [marketRows],
  );

  const cards = useMemo(() => {
    const filtered = marketRows
      .map((row) => {
        const daysRemaining = getDaysRemaining(row.endDate);
        const atRisk = (persistedAtRiskState[row.taskId] ?? 'No') === 'Yes';
        return { row, daysRemaining, atRisk };
      })
      .filter(({ row, daysRemaining }) => {
        const query = designerFilter.trim().toLowerCase();
        const designerNames = (row.designers ?? []).map((person) => person.name);
        const fallbackNames = designerNames.length > 0 ? designerNames : (row.designer ? [row.designer.name] : []);
        const matchesDesigner =
          !query || fallbackNames.some((name) => name.toLowerCase().includes(query));
        const matchesAccount =
          accountFilter === 'all' || String(row.accountName ?? '') === String(accountFilter);
        const statusLabel = row.status?.name?.trim() || 'Not Started';
        const matchesStage = stageFilter === 'all' || statusLabel === stageFilter;
        const matchesDays = matchesDaysFilter(daysRemaining, daysFilter);
        const matchesOverdue =
          overdueFilter === 'all' ||
          (overdueFilter === 'overdue'
            ? daysRemaining !== null && daysRemaining < 0
            : daysRemaining === null || daysRemaining >= 0);

        return matchesDesigner && matchesAccount && matchesStage && matchesDays && matchesOverdue;
      });
    const dir = addedSort === 'recent' ? -1 : 1;
    const sorted = filtered.sort((a, b) => (getSubmissionSortValue(a.row) - getSubmissionSortValue(b.row)) * dir);

    let previousColorIndex = -1;
    return sorted.map((entry) => {
      const seed = Math.abs(entry.row.taskId) % cardColorPalette.length;
      let colorIndex = seed;
      if (colorIndex === previousColorIndex) {
        colorIndex = (colorIndex + 1) % cardColorPalette.length;
      }
      previousColorIndex = colorIndex;
      return { ...entry, cardColor: cardColorPalette[colorIndex] };
    });
  }, [accountFilter, addedSort, daysFilter, designerFilter, marketRows, overdueFilter, persistedAtRiskState, stageFilter]);

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatDisplayDate = (value: string | null) => {
    if (!value) return 'TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'TBD';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const parseTitle = (taskName: string) => {
    if (taskName.includes('|')) {
      const [code, ...rest] = taskName.split('|');
      return { code: code.trim(), name: rest.join('|').trim() };
    }
    if (taskName.includes(' - ')) {
      const [code, ...rest] = taskName.split(' - ');
      return { code: code.trim(), name: rest.join(' - ').trim() };
    }
    return { code: taskName.trim(), name: '' };
  };

  return (
    <AppShell
      title="Project Card View"
      description="Card layout for scanning project health quickly. Use filters to narrow by designer, account, timeline, and risk."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {cards.length} cards
          </span>
        </div>
      }
    >
      <section className="space-y-6">
        <div className="flex flex-wrap gap-4">
          <SearchableFilterChip
            label="Designer"
            value={designerFilter}
            options={designerOptions}
            placeholder="Type designer..."
            onChange={setDesignerFilter}
          />
          <FilterChip
            label="Account"
            value={accountFilter}
            options={accountOptions}
            onChange={setAccountFilter}
          />
          <FilterChip
            label="Sort"
            value={addedSort}
            options={[
              { label: 'Most recent added', value: 'recent' },
              { label: 'Oldest added', value: 'oldest' },
            ]}
            onChange={(value) => setAddedSort(value as 'recent' | 'oldest')}
          />
          <FilterChip
            label="Stage"
            value={stageFilter}
            options={stageOptions}
            onChange={setStageFilter}
          />
          <FilterChip
            label="Days"
            value={daysFilter}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Overdue', value: 'overdue' },
              { label: '0-7', value: '0-7' },
              { label: '8-14', value: '8-14' },
              { label: '15+', value: '15+' },
              { label: 'TBD', value: 'tbd' },
            ]}
            onChange={(value) => setDaysFilter(value as DaysFilter)}
          />
          <FilterChip
            label="Overdue"
            value={overdueFilter}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Overdue', value: 'overdue' },
              { label: 'Not overdue', value: 'not_overdue' },
            ]}
            onChange={(value) => setOverdueFilter(value as OverdueFilter)}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 320px))',
            gap: '16px',
            justifyContent: 'center',
          }}
        >
          {cards.map(({ row, daysRemaining, atRisk, cardColor }) => {
            const statusLabel = row.status?.name ?? 'Not Started';
            const tone = statusTone(statusLabel);
            const invoiceLabel = row.invoice?.statusLabel ?? 'Not invoiced';
            const paymentLabel = row.payment?.statusLabel ?? 'No Invoice';
            const paymentStatus = row.payment?.status ?? 'no_invoice';
            const titleParts = parseTitle(row.taskName);
            const daysMessage =
              daysRemaining === null
                ? 'Timeline TBD'
                : daysRemaining < 0
                  ? `${Math.abs(daysRemaining)} days overdue`
                  : `${daysRemaining} days left`;
            const daysTone =
              daysRemaining === null
                ? 'text-slate-500'
                : daysRemaining < 0
                  ? 'text-rose-600'
                  : daysRemaining <= 2
                    ? 'text-amber-600'
                    : 'text-emerald-600';
            const atRiskPill = 'border-rose-300 bg-rose-100 text-rose-700';
            const strategistValue = row.strategist?.name ?? 'TBD';
            const designerNames = (row.designers ?? []).map((person) => person.name);
            const designerValue = designerNames.length > 0 ? designerNames.join(', ') : (row.designer?.name ?? 'TBD');

            return (
              <article
                key={row.taskId}
                style={{
                  width: 320,
                  borderLeftColor: cardColor,
                  backgroundColor: cardColor,
                }}
                className="m-0 flex min-h-[252px] flex-col gap-2 rounded-[12px] border border-slate-200 border-l-[8px] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 dir="auto" className="truncate text-[15px] font-semibold leading-tight text-slate-900">
                    {titleParts.name ? `${titleParts.code} - ${titleParts.name}` : titleParts.code}
                  </h2>
                  <span
                    className={`inline-flex max-w-[112px] shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-4 break-words whitespace-normal ${tone.pill}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <p dir="auto" className="truncate text-[12px] text-slate-500">
                  {row.accountName ?? 'TBD'}
                  {row.clientAccount ? ` / ${row.clientAccount}` : ''}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  <p className="min-w-0">
                    <span className="text-slate-500">Designer: </span>
                    <span className={designerValue === 'TBD' ? 'text-slate-400' : 'text-slate-800'}>
                      {designerValue}
                    </span>
                  </p>
                  <p className="min-w-0">
                    <span className="text-slate-500">Strategist: </span>
                    <span className={strategistValue === 'TBD' ? 'text-slate-400' : 'text-slate-800'}>
                      {strategistValue}
                    </span>
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="truncate text-[12px] text-slate-700">
                    {formatDisplayDate(row.startDate)} &rarr; {formatDisplayDate(row.endDate)}
                  </p>
                  <p className={`text-[14px] font-semibold ${daysTone}`}>{daysMessage}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex max-w-[120px] items-center justify-center rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-4 break-words whitespace-normal ${invoiceTone(invoiceLabel)}`}
                  >
                    {invoiceLabel}
                  </span>
                  <span
                    className={`inline-flex max-w-[130px] items-center justify-center rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-4 break-words whitespace-normal ${paymentTone(paymentStatus)}`}
                  >
                    {paymentLabel}
                  </span>
                  {atRisk ? (
                    <span
                      className={`inline-flex max-w-[120px] items-center justify-center rounded-full border px-2.5 py-1 text-center text-[11px] font-semibold leading-4 break-words whitespace-normal ${atRiskPill}`}
                    >
                      At Risk
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
