import { useEffect, useState } from 'react';
import snapshotRaw from './data/odoo-projects.json';
import { MainView } from './pages/MainView';
import { CardView } from './pages/CardView';
import { AvailabilityView } from './pages/AvailabilityView';
import { BoardView } from './pages/BoardView';
import type { OdooSnapshot } from './types/projects';

type ViewMode = 'table' | 'cards' | 'availability' | 'board';
type MarketFilter = 'all' | 'UAE' | 'KSA';

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

function MarketSwitcher({
  activeMarket,
  onChange,
}: {
  activeMarket: MarketFilter;
  onChange: (market: MarketFilter) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <span className="px-2 text-[0.63rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Market</span>
      <button
        type="button"
        onClick={() => onChange('all')}
        className={segmentButtonClass(activeMarket === 'all')}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onChange('UAE')}
        className={segmentButtonClass(activeMarket === 'UAE')}
      >
        UAE
      </button>
      <button
        type="button"
        onClick={() => onChange('KSA')}
        className={segmentButtonClass(activeMarket === 'KSA')}
      >
        KSA
      </button>
    </div>
  );
}

function App() {
  const buildMarker = 'live-api-v2';
  const [view, setView] = useState<ViewMode>('table');
  const [market, setMarket] = useState<MarketFilter>('all');
  const [snapshot, setSnapshot] = useState<OdooSnapshot>(snapshotRaw as OdooSnapshot);

  useEffect(() => {
    let active = true;

    const loadLatestSnapshot = async () => {
      try {
        const response = await fetch('/api/odoo-snapshot', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const nextSnapshot = (await response.json()) as OdooSnapshot;
        if (active) {
          setSnapshot(nextSnapshot);
        }
      } catch {
        // Fall back to bundled snapshot when API is unavailable.
      }
    };

    void loadLatestSnapshot();
    return () => {
      active = false;
    };
  }, []);

  const switcher = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ViewSwitcher activeView={view} onChange={setView} />
      <MarketSwitcher activeMarket={market} onChange={setMarket} />
      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.7rem] font-semibold text-slate-600">
        Build: {buildMarker}
      </span>
    </div>
  );

  if (view === 'cards') {
    return <CardView snapshot={snapshot} viewSwitcher={switcher} marketFilter={market} />;
  }

  if (view === 'availability') {
    return <AvailabilityView snapshot={snapshot} viewSwitcher={switcher} marketFilter={market} />;
  }

  if (view === 'board') {
    return <BoardView snapshot={snapshot} viewSwitcher={switcher} marketFilter={market} />;
  }

  return <MainView snapshot={snapshot} viewSwitcher={switcher} marketFilter={market} />;
}

export default App;
