import type { ReactNode } from 'react';

type AppShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
};

export function AppShell({ title, description, actions, children, wide = false }: AppShellProps) {
  const shellWidthClass = wide ? 'max-w-none px-6 lg:px-8' : 'max-w-[1600px] px-10';
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-divider bg-white/95 backdrop-blur-sm">
        <div className={`mx-auto flex h-16 items-center justify-between ${shellWidthClass}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Dashboard
            </p>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          </div>
          {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
        </div>
      </header>
      <main className={`mx-auto w-full py-8 ${shellWidthClass}`}>
        {description ? (
          <p className="mb-8 max-w-3xl text-sm text-slate-500">{description}</p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
