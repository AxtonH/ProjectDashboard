import { useMemo, type ReactNode } from 'react';
import snapshotRaw from '../data/odoo-projects.json';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type WorkloadLabel = 'Available' | 'Acceptable' | 'High' | 'Overload';

type PersonAvailability = {
  id: number;
  name: string;
  projectsThisWeek: number;
  workload: WorkloadLabel;
  projects: string[];
};

const snapshot = snapshotRaw as OdooSnapshot;
const baseRows: ProjectRow[] = snapshot.rows ?? [];

const isPlanningStatus = (statusName: string | null | undefined) => {
  if (!statusName) return true;
  const value = statusName.toLowerCase();
  return !(value.includes('complete') || value.includes('done'));
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

export function AvailabilityView({ viewSwitcher }: { viewSwitcher?: ReactNode }) {
  const availabilityCards = useMemo<PersonAvailability[]>(() => {
    const sourceCards = snapshot.designerAvailability ?? [];
    if (sourceCards.length > 0) {
      return sourceCards.map((entry) => ({
        id: entry.id,
        name: entry.name,
        projectsThisWeek: entry.projectsPast7Days,
        projects: entry.projectNamesPast7Days,
        workload: getWorkload(entry.projectsPast7Days),
      }));
    }

    const map = new Map<number, { id: number; name: string; projects: Set<string> }>();
    for (const row of baseRows) {
      if (!row.designer) continue;
      if (!map.has(row.designer.id)) {
        map.set(row.designer.id, { id: row.designer.id, name: row.designer.name, projects: new Set() });
      }
      if (isPlanningStatus(row.status?.name) && overlapsPast7Days(row)) {
        map.get(row.designer.id)?.projects.add(row.parentProjectName ?? row.taskName);
      }
    }

    return Array.from(map.values())
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        projectsThisWeek: entry.projects.size,
        projects: Array.from(entry.projects).sort((a, b) => a.localeCompare(b)),
        workload: getWorkload(entry.projects.size),
      }))
      .sort((a, b) => {
        if (b.projectsThisWeek !== a.projectsThisWeek) return b.projectsThisWeek - a.projectsThisWeek;
        return a.name.localeCompare(b.name);
      });
  }, []);

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <AppShell
      title="Designer Availability View"
      description="One card per designer from planning slots, with distinct project count over the past 7 days."
      actions={
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-divider px-3 py-1 font-medium text-slate-600">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-divider px-3 py-1 text-slate-400">
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
