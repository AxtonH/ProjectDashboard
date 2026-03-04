import { useEffect, useMemo, useState, type ReactNode } from 'react';
import snapshotRaw from '../data/odoo-projects.json';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type MarketFilter = 'all' | 'UAE' | 'KSA';
type Granularity = 'daily' | 'weekly' | 'monthly';

const snapshot = snapshotRaw as OdooSnapshot;
const baseRows: ProjectRow[] = snapshot.rows ?? [];
const dayMs = 24 * 60 * 60 * 1000;

const rangeOptionsByGranularity: Record<Granularity, number[]> = {
  daily: [14, 30, 60],
  weekly: [8, 12, 16, 24],
  monthly: [3, 6, 9, 12],
};

type TimelineRow = {
  taskId: number;
  taskName: string;
  parentProjectName: string;
  accountName: string;
  startDate: number | null;
  latestEnd: number | null;
  latestEndSource: 'internal' | 'client' | null;
  startIndex: number | null;
  endIndex: number | null;
};

const matchesMarket = (row: ProjectRow, marketFilter: MarketFilter) => {
  if (marketFilter === 'all') return true;
  const market = (row.market ?? '').trim().toUpperCase();
  return market.includes(marketFilter);
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

function isOpenForCapacity(statusName: string | null | undefined) {
  const value = (statusName ?? '').toLowerCase();
  return value.includes('new') || value.includes('open') || value.includes('progress');
}

function startOfWeekMonday(value: number) {
  const date = new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfPeriod(value: number, granularity: Granularity) {
  const date = new Date(value);
  if (granularity === 'monthly') {
    date.setDate(1);
  }
  if (granularity === 'weekly') {
    return startOfWeekMonday(value);
  }
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addPeriods(base: number, granularity: Granularity, count: number) {
  if (granularity === 'daily') return base + count * dayMs;
  if (granularity === 'weekly') return base + count * 7 * dayMs;
  const date = new Date(base);
  date.setMonth(date.getMonth() + count);
  return date.getTime();
}

function formatTick(value: number, granularity: Granularity) {
  if (granularity === 'monthly') {
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(value);
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(value);
}

function formatEnd(value: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(value);
}

function getPeriodIndex(value: number, ticks: number[], windowEnd: number) {
  if (!ticks.length) return null;
  if (value < ticks[0]) return -1;
  if (value >= windowEnd) return ticks.length;
  for (let i = 0; i < ticks.length; i += 1) {
    const next = i === ticks.length - 1 ? windowEnd : ticks[i + 1];
    if (value >= ticks[i] && value < next) return i;
  }
  return ticks.length;
}

export function TimelineView({
  viewSwitcher,
  marketFilter = 'all',
}: {
  viewSwitcher?: ReactNode;
  marketFilter?: MarketFilter;
}) {
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const [rangeSize, setRangeSize] = useState('12');
  const [periodOffset, setPeriodOffset] = useState(0);

  useEffect(() => {
    const options = rangeOptionsByGranularity[granularity];
    if (!options.includes(Number(rangeSize))) {
      setRangeSize(String(options[1] ?? options[0]));
    }
  }, [granularity, rangeSize]);

  useEffect(() => {
    setPeriodOffset(0);
  }, [granularity, rangeSize]);

  const marketRows = useMemo(() => baseRows.filter((row) => matchesMarket(row, marketFilter)), [marketFilter]);

  const timelineData = useMemo(() => {
    const rangeCount = Number(rangeSize);
    const now = Date.now();
    const windowStart = addPeriods(startOfPeriod(now, granularity), granularity, periodOffset);
    const windowEnd = addPeriods(windowStart, granularity, rangeCount);
    const ticks = Array.from({ length: rangeCount }, (_, index) => addPeriods(windowStart, granularity, index));

    const rows = marketRows
      .filter((row) => isOpenForCapacity(row.status?.name))
      .map((row): TimelineRow => {
        const startDate = parseDate(row.startDate);
        const internalEnd = parseDate(row.endDate);
        const clientEnd = parseDate(row.clientDueDate);
        const latestEnd = internalEnd ?? clientEnd;
        const latestEndSource: 'internal' | 'client' | null =
          internalEnd !== null ? 'internal' : (clientEnd !== null ? 'client' : null);
        const startIndex = startDate === null ? null : getPeriodIndex(startDate, ticks, windowEnd);
        const endIndex = latestEnd === null ? null : getPeriodIndex(latestEnd, ticks, windowEnd);
        return {
          taskId: row.taskId,
          taskName: row.taskName ?? '—',
          parentProjectName: row.parentProjectName ?? 'TBD',
          accountName: row.accountName ?? 'TBD',
          startDate,
          latestEnd,
          latestEndSource,
          startIndex,
          endIndex,
        };
      });

    const inWindow = rows
      .filter((row) => row.endIndex !== null && row.endIndex >= 0 && row.endIndex < rangeCount)
      .sort((a, b) => (a.latestEnd ?? Number.POSITIVE_INFINITY) - (b.latestEnd ?? Number.POSITIVE_INFINITY));

    const outWindow = rows
      .filter((row) => row.endIndex !== null && row.endIndex >= rangeCount)
      .sort((a, b) => (a.latestEnd ?? Number.POSITIVE_INFINITY) - (b.latestEnd ?? Number.POSITIVE_INFINITY));

    const overdue = rows
      .filter((row) => row.endIndex !== null && row.endIndex < 0)
      .sort((a, b) => (a.latestEnd ?? 0) - (b.latestEnd ?? 0));

    const missing = rows
      .filter((row) => row.endIndex === null)
      .sort((a, b) => a.taskName.localeCompare(b.taskName));

    return {
      rangeCount,
      ticks,
      rows: [...inWindow, ...overdue, ...outWindow, ...missing],
    };
  }, [granularity, marketRows, periodOffset, rangeSize]);

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const cellWidth = granularity === 'daily' ? 52 : (granularity === 'weekly' ? 86 : 112);
  const gridWidth = timelineData.ticks.length * cellWidth;
  const unitLabel = granularity === 'daily' ? 'days' : (granularity === 'weekly' ? 'weeks' : 'months');

  return (
    <AppShell
      wide
      title="Timeline View"
      description="Timeline by parent task to see expected completion timing and upcoming capacity windows."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {timelineData.rows.length} open tasks
          </span>
        </div>
      }
    >
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
            <span className="uppercase tracking-[0.18em] text-[0.58rem] text-slate-400">View</span>
            <select
              className="bg-transparent text-slate-700 focus:outline-none"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as Granularity)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
            <span className="uppercase tracking-[0.18em] text-[0.58rem] text-slate-400">Range</span>
            <select
              className="bg-transparent text-slate-700 focus:outline-none"
              value={rangeSize}
              onChange={(event) => setRangeSize(event.target.value)}
            >
              {rangeOptionsByGranularity[granularity].map((value) => (
                <option key={`${granularity}-${value}`} value={value}>
                  Next {value} {unitLabel}
                </option>
              ))}
            </select>
          </label>

          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Statuses: New/Open + In Progress</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Sorted by nearest end date</span>
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setPeriodOffset((prev) => prev - 1)}
              className="rounded-full px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPeriodOffset(0)}
              className="rounded-full px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPeriodOffset((prev) => prev + 1)}
              className="rounded-full px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Next
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-slate-200 bg-white">
          <div style={{ minWidth: 380 + gridWidth }} className="divide-y divide-slate-100">
            <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50">
              <div className="w-[380px] shrink-0 px-3 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Parent Task
              </div>
              <div className="relative shrink-0" style={{ width: gridWidth }}>
                {timelineData.ticks.map((tick, index) => (
                  <div
                    key={tick}
                    className="absolute bottom-0 top-0 border-l border-slate-200"
                    style={{ left: `${index * cellWidth}px` }}
                  >
                    <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] text-slate-500">
                      {formatTick(tick, granularity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {timelineData.rows.map((row) => {
              const startLabel = row.startDate !== null ? formatEnd(row.startDate) : 'No Start Date';
              const projectedEndLabel = row.latestEnd !== null
                ? (row.latestEndSource === 'client' ? `${formatEnd(row.latestEnd)} (Client Due)` : formatEnd(row.latestEnd))
                : 'No Internal Due Date';
              const rawStartIndex = row.startIndex;
              const endIndex = row.endIndex;
              const canRenderDuration =
                rawStartIndex !== null &&
                endIndex !== null &&
                endIndex >= 0 &&
                rawStartIndex < timelineData.rangeCount &&
                endIndex >= rawStartIndex;
              const clampedStart = canRenderDuration ? Math.max(0, rawStartIndex) : null;
              const clampedEnd = canRenderDuration ? Math.min(timelineData.rangeCount - 1, endIndex) : null;
              const barLeft = clampedStart !== null ? clampedStart * cellWidth + 6 : 0;
              const barWidth = clampedStart !== null && clampedEnd !== null
                ? Math.max(18, (clampedEnd - clampedStart + 1) * cellWidth - 12)
                : 0;
              return (
                <div key={`timeline-${row.taskId}`} className="flex">
                  <div className="w-[380px] shrink-0 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.taskName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.parentProjectName} • {row.accountName} • {startLabel} → {projectedEndLabel}
                    </p>
                  </div>
                  <div className="relative shrink-0 border-l border-slate-100" style={{ width: gridWidth, height: 42 }}>
                    {timelineData.ticks.map((tick, index) => (
                      <div
                        key={`grid-${row.taskId}-${tick}`}
                        className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-slate-100"
                        style={{ left: `${index * cellWidth}px` }}
                      />
                    ))}
                    {endIndex === null ? (
                      <span className="absolute left-2 top-2 rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        No Internal Due Date
                      </span>
                    ) : endIndex < 0 ? (
                      <span
                        className="absolute left-2 top-2 rounded-full border border-rose-300 bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700"
                        title={`Expected end: ${projectedEndLabel}`}
                      >
                        Overdue ({projectedEndLabel})
                      </span>
                    ) : endIndex >= timelineData.rangeCount ? (
                      <span className="absolute right-2 top-2 rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {`After range (${projectedEndLabel})`}
                      </span>
                    ) : !canRenderDuration ? (
                      <div
                        className="absolute top-3 h-5 rounded-full border border-sky-300 bg-sky-100"
                        style={{ left: `${endIndex * cellWidth + 6}px`, width: `${Math.max(18, cellWidth - 12)}px` }}
                        title={`Start: ${startLabel} | End: ${projectedEndLabel}`}
                      />
                    ) : null}
                    {canRenderDuration && clampedStart !== null && clampedEnd !== null ? (
                      <div
                        className="pointer-events-none absolute top-3 h-5 rounded-full border border-sky-400 bg-sky-200/70"
                        style={{ left: `${barLeft}px`, width: `${barWidth}px` }}
                        title={`Start: ${startLabel} | End: ${projectedEndLabel}`}
                      />
                    ) : null}
                    {endIndex !== null && endIndex < 0 ? (
                      <div
                        className="pointer-events-none absolute top-3 h-5 rounded-full border border-rose-300 bg-rose-100/80"
                        style={{ left: '6px', width: `${Math.max(18, cellWidth - 12)}px` }}
                        title={`Start: ${startLabel} | End: ${projectedEndLabel}`}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
