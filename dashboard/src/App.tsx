import { useEffect, useMemo, useState } from 'react';
import { MainView } from './pages/MainView';
import { CardView } from './pages/CardView';
import { AvailabilityView } from './pages/AvailabilityView';
import { BoardView } from './pages/BoardView';
import { DashboardView } from './pages/DashboardView';
import type { OdooSnapshot } from './types/projects';

type ViewMode = 'dashboard' | 'table' | 'cards' | 'availability' | 'board';
type GlobalFilter = 'all' | string;

const segmentButtonClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-[0.72rem] font-semibold tracking-[0.01em] transition ${
    active
      ? 'bg-slate-900 text-white shadow-[0_1px_2px_rgba(15,23,42,0.25)]'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

function ViewSwitcher({
  activeView,
  onChange,
}: {
  activeView: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange('dashboard')}
        className={segmentButtonClass(activeView === 'dashboard')}
      >
        Dashboard
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={segmentButtonClass(activeView === 'table')}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={segmentButtonClass(activeView === 'cards')}
      >
        Cards
      </button>
      <button
        type="button"
        onClick={() => onChange('availability')}
        className={segmentButtonClass(activeView === 'availability')}
      >
        Availability
      </button>
      <button
        type="button"
        onClick={() => onChange('board')}
        className={segmentButtonClass(activeView === 'board')}
      >
        Board
      </button>
    </div>
  );
}

function GlobalDropdownFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: GlobalFilter;
  options: string[];
  onChange: (value: GlobalFilter) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
      <span className="uppercase tracking-[0.2em] text-[0.6rem] text-slate-400">{label}</span>
      <select
        className="bg-transparent text-slate-700 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">All</option>
        {options.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const buildMarker = 'live-api-v3';
  const [view, setView] = useState<ViewMode>('dashboard');
  const [businessUnit, setBusinessUnit] = useState<GlobalFilter>('all');
  const [subBusinessUnit, setSubBusinessUnit] = useState<GlobalFilter>('all');
  const [snapshot, setSnapshot] = useState<OdooSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const businessUnits = useMemo(
    () =>
      Array.from(
        new Set(
          (snapshot?.rows ?? [])
            .map((row) => (row.businessUnit ?? row.market ?? '').trim())
            .filter((value) => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [snapshot],
  );
  const subBusinessUnits = useMemo(
    () =>
      Array.from(
        new Set(
          (snapshot?.rows ?? [])
            .map((row) => (row.subBusinessUnit ?? '').trim())
            .filter((value) => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [snapshot],
  );

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const isNewerSnapshot = (current: OdooSnapshot | null, next: OdooSnapshot) => {
      if (!current) return true;
      const currentTime = new Date(current.generatedAt).getTime();
      const nextTime = new Date(next.generatedAt).getTime();
      if (Number.isNaN(nextTime)) return false;
      if (Number.isNaN(currentTime)) return true;
      return nextTime >= currentTime;
    };

    const scheduleRetry = (delayMs: number) => {
      if (!active) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      retryTimer = setTimeout(() => {
        void loadLatestSnapshot();
      }, delayMs);
    };

    const loadLatestSnapshot = async () => {
      try {
        const response = await fetch(`/api/odoo-snapshot?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          if (active) {
            setLoadError(`Live sync failed (${response.status}). Retrying...`);
          }
          scheduleRetry(5000);
          return;
        }
        const nextSnapshot = (await response.json()) as OdooSnapshot;
        if (active) {
          setLoadError(null);
          setSnapshot((current) => (isNewerSnapshot(current, nextSnapshot) ? nextSnapshot : current));
        }
      } catch {
        if (active) {
          setLoadError('Live sync unavailable. Retrying...');
        }
        scheduleRetry(5000);
      }
    };

    void loadLatestSnapshot();
    pollTimer = setInterval(() => {
      void loadLatestSnapshot();
    }, 60000);

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, []);

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-xl font-semibold text-slate-900">Loading latest Odoo data...</h1>
          <p className="mt-2 text-sm text-slate-600">
            Stale snapshot fallback is disabled. The dashboard will appear after a successful live sync.
          </p>
          {loadError ? (
            <p className="mt-3 text-sm font-medium text-rose-700">{loadError}</p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">Build: {buildMarker}</p>
        </div>
      </main>
    );
  }

  const switcher = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ViewSwitcher activeView={view} onChange={setView} />
      <GlobalDropdownFilter label="Business Unit" value={businessUnit} options={businessUnits} onChange={setBusinessUnit} />
      <GlobalDropdownFilter label="Sub-business Unit" value={subBusinessUnit} options={subBusinessUnits} onChange={setSubBusinessUnit} />
      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.7rem] font-semibold text-slate-600">
        Build: {buildMarker}
      </span>
    </div>
  );

  if (view === 'dashboard') {
    return (
      <DashboardView
        snapshot={snapshot}
        viewSwitcher={switcher}
        marketFilter={businessUnit}
        subBusinessUnitFilter={subBusinessUnit}
        onOpenBoard={() => setView('board')}
      />
    );
  }

  if (view === 'cards') {
    return <CardView snapshot={snapshot} viewSwitcher={switcher} marketFilter={businessUnit} subBusinessUnitFilter={subBusinessUnit} />;
  }

  if (view === 'availability') {
    return <AvailabilityView snapshot={snapshot} viewSwitcher={switcher} marketFilter={businessUnit} subBusinessUnitFilter={subBusinessUnit} />;
  }

  if (view === 'board') {
    return <BoardView snapshot={snapshot} viewSwitcher={switcher} marketFilter={businessUnit} subBusinessUnitFilter={subBusinessUnit} />;
  }

  return <MainView snapshot={snapshot} viewSwitcher={switcher} marketFilter={businessUnit} subBusinessUnitFilter={subBusinessUnit} />;
}

export default App;
