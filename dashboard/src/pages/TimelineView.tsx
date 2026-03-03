import { useMemo, useState, type ReactNode } from 'react';
import snapshotRaw from '../data/odoo-projects.json';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type MarketFilter = 'all' | 'UAE' | 'KSA';
type RangeFilter = '30' | '60' | '90';
type StageFilter = 'all' | 'active' | 'open' | 'progress' | 'completed';

type Assignment = {
  taskId: number;
  taskName: string;
  accountName: string;
  statusName: string;
  start: number;
  end: number;
  endRaw: number | null;
};

type LaneAssignment = Assignment & {
  lane: number;
};

type DesignerLane = {
  id: number;
  name: string;
  items: LaneAssignment[];
  laneCount: number;
  endingSoonCount: number;
  endingSoonNames: string[];
};

const snapshot = snapshotRaw as OdooSnapshot;
const baseRows: ProjectRow[] = snapshot.rows ?? [];
const dayMs = 24 * 60 * 60 * 1000;

const matchesMarket = (row: ProjectRow, marketFilter: MarketFilter) => {
  if (marketFilter === 'all') return true;
  const market = (row.market ?? '').trim().toUpperCase();
  return market.includes(marketFilter);
};

const parseDate = (value: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const normalizeStatus = (statusName: string | null | undefined) => {
  const value = (statusName ?? '').toLowerCase();
  if (value.includes('complete') || value.includes('done')) return 'completed';
  if (value.includes('progress') || value.includes('review') || value.includes('feedback')) return 'progress';
  return 'open';
};

const statusColor = (statusName: string) => {
  const type = normalizeStatus(statusName);
  if (type === 'completed') return 'bg-emerald-200 border-emerald-400 text-emerald-900';
  if (type === 'progress') return 'bg-sky-200 border-sky-400 text-sky-900';
  return 'bg-amber-200 border-amber-400 text-amber-900';
};

function matchesStageFilter(statusName: string | null | undefined, filter: StageFilter) {
  if (filter === 'all') return true;
  const type = normalizeStatus(statusName);
  if (filter === 'active') return type !== 'completed';
  return type === filter;
}

function formatDay(value: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(value);
}

export function TimelineView({
  viewSwitcher,
  marketFilter = 'all',
}: {
  viewSwitcher?: ReactNode;
  marketFilter?: MarketFilter;
}) {
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('60');
  const [stageFilter, setStageFilter] = useState<StageFilter>('active');
  const [designerQuery, setDesignerQuery] = useState('');

  const marketRows = useMemo(() => baseRows.filter((row) => matchesMarket(row, marketFilter)), [marketFilter]);

  const timelineData = useMemo(() => {
    const now = Date.now();
    const today = new Date(now);
    const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const windowDays = Number(rangeFilter);
    const windowEnd = windowStart + windowDays * dayMs;
    const soonEnd = windowStart + 7 * dayMs;
    const assignees = new Map<number, { id: number; name: string; items: Assignment[] }>();

    for (const row of marketRows) {
      if (!matchesStageFilter(row.status?.name, stageFilter)) continue;

      const endRaw = parseDate(row.endDate);
      const startRaw = parseDate(row.startDate);
      if (startRaw === null && endRaw === null) continue;

      // If a task has no start date, treat it as ending-date-centric work.
      let start = startRaw ?? ((endRaw ?? windowStart) - 2 * dayMs);
      let end = endRaw ?? start;
      if (end < start) {
        const swap = start;
        start = end;
        end = swap;
      }

      if (end < windowStart || start > windowEnd) continue;
      const clampedStart = Math.max(start, windowStart);
      const clampedEnd = Math.min(end, windowEnd);

      const designers = (row.designers ?? []).length > 0
        ? (row.designers ?? [])
        : (row.designer ? [row.designer] : []);

      for (const designer of designers) {
        if (!designer) continue;
        if (!assignees.has(designer.id)) {
          assignees.set(designer.id, { id: designer.id, name: designer.name, items: [] });
        }
        assignees.get(designer.id)?.items.push({
          taskId: row.taskId,
          taskName: row.taskName,
          accountName: row.accountName ?? 'TBD',
          statusName: row.status?.name ?? 'Not Started',
          start: clampedStart,
          end: Math.max(clampedEnd, clampedStart + dayMs * 0.2),
          endRaw,
        });
      }
    }

    const lanes: DesignerLane[] = [];
    for (const entry of assignees.values()) {
      const query = designerQuery.trim().toLowerCase();
      if (query && !entry.name.toLowerCase().includes(query)) continue;

      const sorted = [...entry.items].sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return a.end - b.end;
      });

      const laneEnds: number[] = [];
      const packed: LaneAssignment[] = [];
      for (const item of sorted) {
        let laneIndex = laneEnds.findIndex((end) => item.start > end);
        if (laneIndex === -1) {
          laneIndex = laneEnds.length;
          laneEnds.push(item.end);
        } else {
          laneEnds[laneIndex] = item.end;
        }
        packed.push({ ...item, lane: laneIndex });
      }

      const soonItems = sorted.filter((item) => item.endRaw !== null && item.endRaw >= windowStart && item.endRaw <= soonEnd);
      const endingSoonNames = Array.from(new Set(soonItems.map((item) => item.taskName))).slice(0, 3);

      lanes.push({
        id: entry.id,
        name: entry.name,
        items: packed,
        laneCount: Math.max(1, laneEnds.length),
        endingSoonCount: soonItems.length,
        endingSoonNames,
      });
    }

    lanes.sort((a, b) => {
      if (b.endingSoonCount !== a.endingSoonCount) return b.endingSoonCount - a.endingSoonCount;
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return a.name.localeCompare(b.name);
    });

    const tickDays = Array.from({ length: Math.floor(windowDays / 7) + 1 }, (_, index) => index * 7);
    return { lanes, windowStart, windowEnd, windowDays, tickDays };
  }, [designerQuery, marketRows, rangeFilter, stageFilter]);

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const trackWidth = 1120;
  const rangeMs = timelineData.windowEnd - timelineData.windowStart;
  const leftFor = (value: number) => `${((value - timelineData.windowStart) / rangeMs) * 100}%`;
  const widthFor = (start: number, end: number) => `${Math.max(0.8, ((end - start) / rangeMs) * 100)}%`;

  return (
    <AppShell
      wide
      title="Timeline View"
      description="Gantt timeline by designer to visualize project end dates and near-term capacity pressure."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {timelineData.lanes.length} designers
          </span>
        </div>
      }
    >
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs">
            <span className="uppercase tracking-[0.2em] text-[0.6rem] text-slate-400">Range</span>
            <select
              value={rangeFilter}
              onChange={(event) => setRangeFilter(event.target.value as RangeFilter)}
              className="bg-transparent text-slate-700 focus:outline-none"
            >
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs">
            <span className="uppercase tracking-[0.2em] text-[0.6rem] text-slate-400">Stage</span>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as StageFilter)}
              className="bg-transparent text-slate-700 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="open">Open / New</option>
              <option value="progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs">
            <span className="uppercase tracking-[0.2em] text-[0.6rem] text-slate-400">Designer</span>
            <input
              value={designerQuery}
              onChange={(event) => setDesignerQuery(event.target.value)}
              placeholder="Type name..."
              className="w-[180px] bg-transparent text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div style={{ minWidth: 240 + trackWidth }} className="divide-y divide-slate-100">
            <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50">
              <div className="w-[240px] shrink-0 px-3 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Designer
              </div>
              <div className="relative shrink-0" style={{ width: trackWidth }}>
                {timelineData.tickDays.map((offset) => {
                  const tick = timelineData.windowStart + offset * dayMs;
                  return (
                    <div key={offset} className="absolute bottom-0 top-0 border-l border-slate-200" style={{ left: leftFor(tick) }}>
                      <span className="absolute -translate-x-1/2 -translate-y-1 rounded bg-white px-1 text-[10px] text-slate-500">
                        {formatDay(tick)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {timelineData.lanes.map((lane) => {
              const rowHeight = lane.laneCount * 28 + 10;
              return (
                <div key={`timeline-${lane.id}`} className="flex">
                  <div className="w-[240px] shrink-0 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{lane.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {lane.endingSoonCount} ending in 7d
                      {lane.endingSoonNames.length > 0 ? ` • ${lane.endingSoonNames.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="relative shrink-0 border-l border-slate-100 px-1 py-1" style={{ width: trackWidth, height: rowHeight }}>
                    {timelineData.tickDays.map((offset) => {
                      const tick = timelineData.windowStart + offset * dayMs;
                      return (
                        <div
                          key={`grid-${lane.id}-${offset}`}
                          className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-slate-100"
                          style={{ left: leftFor(tick) }}
                        />
                      );
                    })}
                    {lane.items.map((item) => (
                      <div
                        key={`${lane.id}-${item.taskId}-${item.start}-${item.end}-${item.lane}`}
                        title={`${item.taskName}\n${item.accountName}\n${formatDay(item.start)} → ${formatDay(item.end)}\n${item.statusName}`}
                        className={`absolute flex items-center rounded border px-2 text-[11px] font-medium ${statusColor(item.statusName)}`}
                        style={{
                          left: leftFor(item.start),
                          width: widthFor(item.start, item.end),
                          top: item.lane * 28 + 4,
                          height: 22,
                        }}
                      >
                        <span className="truncate">{item.taskName}</span>
                      </div>
                    ))}
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
