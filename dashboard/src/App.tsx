import { useState } from 'react';
import { MainView } from './pages/MainView';
import { CardView } from './pages/CardView';
import { AvailabilityView } from './pages/AvailabilityView';
import { BoardView } from './pages/BoardView';

type ViewMode = 'table' | 'cards' | 'availability' | 'board';

function ViewSwitcher({
  activeView,
  onChange,
}: {
  activeView: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-divider bg-white p-1 text-xs font-semibold text-slate-500 shadow-sm">
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`rounded-full px-3 py-1 transition ${
          activeView === 'table' ? 'bg-slate-900 text-white' : 'hover:text-slate-800'
        }`}
      >
        View 1
      </button>
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={`rounded-full px-3 py-1 transition ${
          activeView === 'cards' ? 'bg-slate-900 text-white' : 'hover:text-slate-800'
        }`}
      >
        View 2
      </button>
      <button
        type="button"
        onClick={() => onChange('availability')}
        className={`rounded-full px-3 py-1 transition ${
          activeView === 'availability' ? 'bg-slate-900 text-white' : 'hover:text-slate-800'
        }`}
      >
        View 3
      </button>
      <button
        type="button"
        onClick={() => onChange('board')}
        className={`rounded-full px-3 py-1 transition ${
          activeView === 'board' ? 'bg-slate-900 text-white' : 'hover:text-slate-800'
        }`}
      >
        View 4
      </button>
    </div>
  );
}

function App() {
  const [view, setView] = useState<ViewMode>('table');
  const switcher = <ViewSwitcher activeView={view} onChange={setView} />;

  if (view === 'cards') {
    return <CardView viewSwitcher={switcher} />;
  }

  if (view === 'availability') {
    return <AvailabilityView viewSwitcher={switcher} />;
  }

  if (view === 'board') {
    return <BoardView viewSwitcher={switcher} />;
  }

  return <MainView viewSwitcher={switcher} />;
}

export default App;
