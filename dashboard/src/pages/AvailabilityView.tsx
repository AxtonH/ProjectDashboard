import { useMemo, type ReactNode } from 'react';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type WorkloadLabel = 'Available' | 'Acceptable' | 'High' | 'Overload';
type MarketFilter = 'all' | 'UAE' | 'KSA';

type PersonAvailability = {
  id: number;
  name: string;
  projectsThisWeek: number;
  hoursThisWeek: number;
  workload: WorkloadLabel;
  projects: string[];
};

const isPlanningStatus = (statusName: string | null | undefined) => {
  if (!statusName) return true;
  const value = statusName.toLowerCase();
  return !(value.includes('complete') || value.includes('done') || value.includes('cancel'));
};

const parseDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const overlapsPast7Days = (row: ProjectRow) => {
  const now = Date.now();
  const windowStart = now - 7 * 24 * 60 * 60 * 1000;
  const start = parseDate(row.startDate);
  const end = parseDate(row.endDate);

  if (start !== null && end !== null) return start <= now && end >= windowStart;
  if (start !== null) return start >= windowStart && start <= now;
  if (end !== null) return end >= windowStart && end <= now;
  return false;
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

const getWorkload = (projectsThisWeek: number): WorkloadLabel => {
  if (projectsThisWeek >= 3) return 'Overload';
  if (projectsThisWeek >= 2) return 'High';
  if (projectsThisWeek === 1) return 'Acceptable';
  return 'Available';
};

function workloadStyle(workload: WorkloadLabel) {
  if (workload === 'Available') return 'border-emerald-300 bg-emerald-200 text-emerald-900';
  if (workload === 'Acceptable') return 'border-yellow-300 bg-yellow-200 text-yellow-900';
  if (workload === 'High') return 'border-orange-300 bg-orange-200 text-orange-900';
  return 'border-rose-300 bg-rose-200 text-rose-900';
}

export function AvailabilityView({
  snapshot,
  viewSwitcher,
  marketFilter = 'all',
}: {
  snapshot: OdooSnapshot;
  viewSwitcher?: ReactNode;
  marketFilter?: MarketFilter;
}) {
  const baseRows: ProjectRow[] = snapshot.rows ?? [];
  const marketRows = useMemo(
    () => baseRows.filter((row) => matchesMarket(row, marketFilter) && !isCanceledStatus(row.status?.name)),
    [baseRows, marketFilter],
  );

  const availabilityCards = useMemo<PersonAvailability[]>(() => {
    const marketKey = marketFilter === 'UAE' ? 'uae' : (marketFilter === 'KSA' ? 'ksa' : 'all');
    const sourceCards = snapshot.designerAvailabilityByMarket?.[marketKey] ?? snapshot.designerAvailability ?? [];
    if (sourceCards.length > 0) {
      return sourceCards.map((entry) => ({
        id: entry.id,
        name: entry.name,
        projectsThisWeek: entry.projectsPast7Days,
        hoursThisWeek: Number(entry.hoursPast7Days ?? 0),
        projects: entry.projectNamesPast7Days,
        workload: getWorkload(entry.projectsPast7Days),
      }));
    }

    const map = new Map<number, { id: number; name: string; projects: Set<string> }>();
    for (const row of marketRows) {
      const designers = (row.designers ?? []).length > 0 ? (row.designers ?? []) : (row.designer ? [row.designer] : []);
      if (designers.length === 0) continue;
      for (const designer of designers) {
        if (!map.has(designer.id)) {
          map.set(designer.id, { id: designer.id, name: designer.name, projects: new Set() });
        }
        if (isPlanningStatus(row.status?.name) && overlapsPast7Days(row)) {
          map.get(designer.id)?.projects.add(row.parentProjectName ?? row.taskName);
        }
      }
    }

    return Array.from(map.values())
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        projectsThisWeek: entry.projects.size,
        hoursThisWeek: 0,
        projects: Array.from(entry.projects).sort((a, b) => a.localeCompare(b)),
        workload: getWorkload(entry.projects.size),
      }))
      .sort((a, b) => {
        if (b.projectsThisWeek !== a.projectsThisWeek) return b.projectsThisWeek - a.projectsThisWeek;
        return a.name.localeCompare(b.name);
      });
  }, [marketFilter, marketRows, snapshot.designerAvailability, snapshot.designerAvailabilityByMarket]);

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
      title="Designer Availability View"
      description="One card per designer from planning slots, with distinct project count over the past 7 days."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {availabilityCards.length} designers
          </span>
        </div>
      }
    >
      <section className="space-y-6">
        <p className="text-sm text-slate-600">
          Counts are distinct projects in planning over the past 7 days.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {availabilityCards.map((person) => (
            <article
              key={`Person-${person.id}`}
              className={`rounded-md border p-4 shadow-sm ${workloadStyle(person.workload)}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Designer</p>
              <h2 className="mt-1 text-base font-bold leading-tight">{person.name}</h2>
              <p className="mt-2 text-sm font-semibold">
                Projects this week: <span className="text-lg">{person.projectsThisWeek}</span>
              </p>
              <p className="mt-1 text-sm font-semibold">
                Hours this week: <span className="text-lg">{person.hoursThisWeek.toFixed(1)}</span>
              </p>
              <p className="mt-1 text-sm font-bold">{person.workload}</p>
              <p className="mt-3 line-clamp-2 text-xs opacity-85">
                {person.projects.length > 0 ? person.projects.join(', ') : 'No projects in current week'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
