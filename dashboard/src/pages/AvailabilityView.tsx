import { useMemo, useState, type ReactNode } from 'react';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type WorkloadLabel = 'Available' | 'Acceptable' | 'High' | 'Overload';
type MarketFilter = 'all' | 'UAE' | 'KSA';
type WeekWindow = 'past7' | 'next7';

type PersonAvailability = {
  id: number;
  name: string;
  projectsThisWeek: number;
  hoursThisWeek: number;
  workload: WorkloadLabel;
  projects: string[];
};

type AvailabilityEntry = {
  id: number;
  name: string;
  projectsPast7Days: number;
  projectNamesPast7Days: string[];
  hoursPast7Days?: number;
};

const parseDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const overlapsWindow = (row: ProjectRow, windowStart: number, windowEnd: number) => {
  const start = parseDate(row.startDate);
  const end = parseDate(row.endDate);
  if (start !== null && end !== null) return start <= windowEnd && end >= windowStart;
  if (start !== null) return start >= windowStart && start <= windowEnd;
  if (end !== null) return end >= windowStart && end <= windowEnd;
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

const resolveWindowEntries = (
  snapshot: OdooSnapshot,
  marketFilter: MarketFilter,
  weekWindow: WeekWindow,
): AvailabilityEntry[] => {
  const marketKey = marketFilter === 'UAE' ? 'uae' : marketFilter === 'KSA' ? 'ksa' : 'all';
  const byMarket = snapshot.designerAvailabilityByMarket?.[marketKey];
  if (byMarket && !Array.isArray(byMarket)) {
    return weekWindow === 'past7' ? byMarket.past7Days : byMarket.next7Days;
  }
  if (Array.isArray(byMarket)) {
    return byMarket;
  }
  return snapshot.designerAvailability ?? [];
};

export function AvailabilityView({
  snapshot,
  viewSwitcher,
  marketFilter = 'all',
}: {
  snapshot: OdooSnapshot;
  viewSwitcher?: ReactNode;
  marketFilter?: MarketFilter;
}) {
  const [weekWindow, setWeekWindow] = useState<WeekWindow>('past7');
  const [searchTerm, setSearchTerm] = useState('');
  const [includeAllDesigners, setIncludeAllDesigners] = useState(true);

  const baseRows: ProjectRow[] = snapshot.rows ?? [];
  const marketRows = useMemo(
    () => baseRows.filter((row) => matchesMarket(row, marketFilter) && !isCanceledStatus(row.status?.name)),
    [baseRows, marketFilter],
  );

  const availabilityCards = useMemo<PersonAvailability[]>(() => {
    const sourceCards = resolveWindowEntries(snapshot, marketFilter, weekWindow);
    const map = new Map(
      sourceCards.map((entry) => [
        entry.id,
        {
          id: entry.id,
          name: entry.name,
          projectsThisWeek: entry.projectsPast7Days,
          hoursThisWeek: Number(entry.hoursPast7Days ?? 0),
          projects: entry.projectNamesPast7Days,
          workload: getWorkload(entry.projectsPast7Days),
        },
      ]),
    );

    if (!sourceCards.length) {
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const windowStart = weekWindow === 'past7' ? now - sevenDaysMs : now;
      const windowEnd = weekWindow === 'past7' ? now : now + sevenDaysMs;

      for (const row of marketRows) {
        const designers = (row.designers ?? []).length > 0 ? (row.designers ?? []) : row.designer ? [row.designer] : [];
        if (!designers.length || !overlapsWindow(row, windowStart, windowEnd)) continue;
        for (const designer of designers) {
          if (!map.has(designer.id)) {
            map.set(designer.id, {
              id: designer.id,
              name: designer.name,
              projectsThisWeek: 0,
              hoursThisWeek: 0,
              projects: [],
              workload: 'Available',
            });
          }
          const current = map.get(designer.id);
          if (!current) continue;
          const projectName = row.parentProjectName ?? row.taskName;
          if (!current.projects.includes(projectName)) {
            current.projects.push(projectName);
            current.projectsThisWeek = current.projects.length;
            current.workload = getWorkload(current.projectsThisWeek);
          }
        }
      }
    }

    if (includeAllDesigners) {
      for (const person of snapshot.creativeEmployees ?? []) {
        if (!map.has(person.id)) {
          map.set(person.id, {
            id: person.id,
            name: person.name,
            projectsThisWeek: 0,
            hoursThisWeek: 0,
            projects: [],
            workload: 'Available',
          });
        }
      }
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        projects: [...entry.projects].sort((a, b) => a.localeCompare(b)),
      }))
      .filter((entry) => {
        if (!normalizedSearch) return true;
        return entry.name.toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => {
        if (b.projectsThisWeek !== a.projectsThisWeek) return b.projectsThisWeek - a.projectsThisWeek;
        if (b.hoursThisWeek !== a.hoursThisWeek) return b.hoursThisWeek - a.hoursThisWeek;
        return a.name.localeCompare(b.name);
      });
  }, [snapshot, marketFilter, weekWindow, marketRows, includeAllDesigners, searchTerm]);

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

  const windowLabel = weekWindow === 'past7' ? 'Past 7 days' : 'Upcoming 7 days';

  return (
    <AppShell
      title="Designer Availability View"
      description="One card per designer from planning slots."
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-[0.72rem] font-semibold ${
                weekWindow === 'past7' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => setWeekWindow('past7')}
            >
              Past 7 days
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-[0.72rem] font-semibold ${
                weekWindow === 'next7' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => setWeekWindow('next7')}
            >
              Upcoming 7 days
            </button>
          </div>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search designer..."
            className="w-56 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-300 focus:outline-none"
          />
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeAllDesigners}
              onChange={(event) => setIncludeAllDesigners(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
            />
            Include all Creative designers
          </label>
        </div>

        <p className="text-sm text-slate-600">
          Showing {windowLabel} planning load based on distinct projects.
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
                Projects: <span className="text-lg">{person.projectsThisWeek}</span>
              </p>
              <p className="mt-1 text-sm font-semibold">
                Hours: <span className="text-lg">{person.hoursThisWeek.toFixed(1)}</span>
              </p>
              <p className="mt-1 text-sm font-bold">{person.workload}</p>
              <p className="mt-3 line-clamp-2 text-xs opacity-85">
                {person.projects.length > 0 ? person.projects.join(', ') : 'No projects in selected window'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
