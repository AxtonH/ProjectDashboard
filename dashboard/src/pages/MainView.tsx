import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import snapshotRaw from '../data/odoo-projects.json';
import { AppShell } from '../components/layout/AppShell';
import type { OdooSnapshot, ProjectRow } from '../types/projects';

type SortKey = 'startDate' | 'endDate' | 'status' | 'submissionDate';
type SortDirection = 'asc' | 'desc';
type AtRiskValue = 'Yes' | 'No';
type MarketFilter = 'all' | 'UAE' | 'KSA';
type ColumnFilterState = Record<string, string>;
type DateRangeFilterState = {
  startDateFrom: string;
  startDateTo: string;
  endDateFrom: string;
  endDateTo: string;
};

const formatCurrencyAed = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);

const snapshot = snapshotRaw as OdooSnapshot;
const baseRows: ProjectRow[] = snapshot.rows ?? [];
const atRiskStorageKey = 'main-view-at-risk-state-v1';

const statusTone = (value?: string | null) => {
  if (!value) return 'border-[#e1e6ef] bg-[#f7f8fb] text-[#626f82]';
  const label = value.toLowerCase();
  if (label.includes('progress')) {
    return 'border-[#fde7ba] bg-[#fff7e2] text-[#a26800]';
  }
  if (label.includes('review') || label.includes('feedback')) {
    return 'border-[#ffd7d1] bg-[#ffefec] text-[#b54139]';
  }
  if (label.includes('hold')) {
    return 'border-[#e6dcff] bg-[#f4efff] text-[#6d54b8]';
  }
  if (label.includes('start')) {
    return 'border-[#d9e7ff] bg-[#edf5ff] text-[#3b67c6]';
  }
  if (label.includes('done') || label.includes('complete')) {
    return 'border-[#cfe8d9] bg-[#edf7f1] text-[#2d7c4f]';
  }
  return 'border-[#e1e6ef] bg-[#f7f8fb] text-[#626f82]';
};

const invoiceToneMap = {
  invoiced: { label: 'Invoiced', tone: 'border-[#cde7d9] bg-[#ecf6ef] text-[#2f7e50]' },
  half_invoiced: { label: '50% invoiced', tone: 'border-[#fde7ba] bg-[#fff7e2] text-[#a26800]' },
  not_invoiced: { label: 'Not invoiced', tone: 'border-[#dfe3eb] bg-[#f6f7fb] text-[#5f6a7c]' },
} as const;

const paymentToneMap = {
  paid: { label: 'Paid', tone: 'border-[#cde7d9] bg-[#ecf6ef] text-[#2f7e50]' },
  in_payment: { label: 'In Payment', tone: 'border-[#d9e7ff] bg-[#edf5ff] text-[#3b67c6]' },
  partial: { label: 'Partially Paid', tone: 'border-[#fde7ba] bg-[#fff7e2] text-[#a26800]' },
  not_paid: { label: 'Not Paid', tone: 'border-[#ffd7d1] bg-[#ffefec] text-[#b54139]' },
  reversed: { label: 'Reversed', tone: 'border-[#e6dcff] bg-[#f4efff] text-[#6d54b8]' },
  no_invoice: { label: 'No Invoice', tone: 'border-[#dfe3eb] bg-[#f6f7fb] text-[#5f6a7c]' },
  unknown: { label: 'Unknown', tone: 'border-[#dfe3eb] bg-[#f6f7fb] text-[#5f6a7c]' },
} as const;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const getSubmissionSortValue = (row: ProjectRow) => {
  if (row.submissionDate) {
    const time = new Date(row.submissionDate).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return row.taskId;
};

const toPlainText = (value: string) =>
  value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const columns: Array<{
  key: string;
  label: string;
  helper?: string;
  sortKey?: SortKey;
  width?: string;
}> = [
  { key: 'account', label: 'Account Name', helper: 'Client / Account', width: '240px' },
  { key: 'project', label: 'Project Name', width: '280px' },
  { key: 'description', label: 'Description', width: '240px' },
  { key: 'designer', label: 'Designer', width: '140px' },
  { key: 'strategist', label: 'Strategist', width: '150px' },
  { key: 'status', label: 'Status', sortKey: 'status' as SortKey, width: '150px' },
  { key: 'invoice', label: 'Invoice', width: '110px' },
  { key: 'payment', label: 'Payment', width: '130px' },
  { key: 'revenue', label: 'Revenue', width: '130px' },
  { key: 'amountToInvoice', label: 'Amount to Invoice', width: '170px' },
  { key: 'startDate', label: 'Start Date', sortKey: 'startDate' as SortKey, width: '150px' },
  {
    key: 'endDate',
    label: 'End Date',
    sortKey: 'endDate' as SortKey,
    width: '150px',
  },
  { key: 'atRisk', label: 'At Risk', width: '110px' },
] as const;

const columnStyles = columns.reduce<Record<string, CSSProperties>>((acc, column) => {
  if (column.width) {
    acc[column.key] = { width: column.width };
  }
  return acc;
}, {});

function Pill({
  tone,
  children,
  onClick,
}: {
  tone: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const Component = onClick ? 'button' : 'span';
  return (
    <Component
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold leading-none ${
        onClick ? 'transition hover:shadow-sm' : ''
      } ${tone}`}
    >
      {children}
    </Component>
  );
}

const initialAtRiskState = Object.fromEntries(baseRows.map((row) => [row.taskId, 'No'])) as Record<
  number,
  AtRiskValue
>;
const initialColumnFilters = Object.fromEntries(columns.map((column) => [column.key, ''])) as ColumnFilterState;
const initialDateRangeFilters: DateRangeFilterState = {
  startDateFrom: '',
  startDateTo: '',
  endDateFrom: '',
  endDateTo: '',
};

const toDayStart = (dateInput: string) => {
  if (!dateInput) return null;
  const date = new Date(`${dateInput}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const toDayEnd = (dateInput: string) => {
  if (!dateInput) return null;
  const date = new Date(`${dateInput}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const toTimestamp = (value: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const matchesMarket = (row: ProjectRow, marketFilter: MarketFilter) => {
  if (marketFilter === 'all') return true;
  const market = (row.market ?? '').trim().toUpperCase();
  return market.includes(marketFilter);
};

const getColumnValue = (row: ProjectRow, key: string, rowAtRisk: AtRiskValue) => {
  if (key === 'account') {
    return `${row.accountName ?? ''}${row.clientAccount ? ` / ${row.clientAccount}` : ''}`.trim() || '—';
  }
  if (key === 'project') {
    return `${row.taskName ?? ''}${row.parentProjectName ? ` / ${row.parentProjectName}` : ''}`.trim() || '—';
  }
  if (key === 'description') {
    return row.description ? toPlainText(row.description) : '—';
  }
  if (key === 'designer') {
    const names = (row.designers ?? []).map((person) => person.name);
    if (names.length > 0) return names.join(', ');
    return row.designer?.name ?? '—';
  }
  if (key === 'strategist') {
    return row.strategist?.name ?? '—';
  }
  if (key === 'status') {
    return row.status?.name ?? '—';
  }
  if (key === 'invoice') {
    if (!row.invoice) return 'Not invoiced';
    const tone = invoiceToneMap[row.invoice.status] ?? invoiceToneMap.not_invoiced;
    return tone.label;
  }
  if (key === 'startDate') {
    return formatDate(row.startDate);
  }
  if (key === 'endDate') {
    return formatDate(row.endDate);
  }
  if (key === 'payment') {
    if (!row.payment) return 'No Invoice';
    return row.payment.statusLabel;
  }
  if (key === 'revenue') {
    return formatCurrencyAed(Number(row.revenueAed ?? 0));
  }
  if (key === 'amountToInvoice') {
    return formatCurrencyAed(Number(row.amountToInvoiceAed ?? 0));
  }
  if (key === 'atRisk') {
    return rowAtRisk;
  }
  return '—';
};

export function MainView({ viewSwitcher, marketFilter = 'all' }: { viewSwitcher?: ReactNode; marketFilter?: MarketFilter }) {
  const [sortState, setSortState] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'submissionDate',
    direction: 'desc',
  });
  const [atRiskState, setAtRiskState] = useState<Record<number, AtRiskValue>>(() => {
    if (typeof window === 'undefined') return initialAtRiskState;
    try {
      const saved = window.localStorage.getItem(atRiskStorageKey);
      if (!saved) return initialAtRiskState;
      const parsed = JSON.parse(saved) as Record<string, AtRiskValue>;
      const merged = { ...initialAtRiskState };
      for (const row of baseRows) {
        const savedValue = parsed[String(row.taskId)];
        if (savedValue === 'Yes' || savedValue === 'No') {
          merged[row.taskId] = savedValue;
        }
      }
      return merged;
    } catch {
      return initialAtRiskState;
    }
  });
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState>(initialColumnFilters);
  const [dateRangeFilters, setDateRangeFilters] = useState<DateRangeFilterState>(initialDateRangeFilters);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(atRiskStorageKey, JSON.stringify(atRiskState));
  }, [atRiskState]);

  const marketRows = useMemo(() => baseRows.filter((row) => matchesMarket(row, marketFilter)), [marketFilter]);

  const columnFilterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    columns.forEach((column) => {
      const values = Array.from(
        new Set(
          marketRows.map((row) => {
            const rowAtRisk = atRiskState[row.taskId] ?? 'No';
            return getColumnValue(row, column.key, rowAtRisk);
          }),
        ),
      ).sort((a, b) => a.localeCompare(b));
      options[column.key] = values;
    });
    return options;
  }, [atRiskState, marketRows]);

  const filteredRows = useMemo(() => {
    return marketRows.filter((row) => {
      const rowAtRisk = atRiskState[row.taskId] ?? 'No';
      const startTime = toTimestamp(row.startDate);
      const endTime = toTimestamp(row.endDate);
      const startFrom = toDayStart(dateRangeFilters.startDateFrom);
      const startTo = toDayEnd(dateRangeFilters.startDateTo);
      const endFrom = toDayStart(dateRangeFilters.endDateFrom);
      const endTo = toDayEnd(dateRangeFilters.endDateTo);

      const matchesStartFrom = startFrom === null || (startTime !== null && startTime >= startFrom);
      const matchesStartTo = startTo === null || (startTime !== null && startTime <= startTo);
      const matchesEndFrom = endFrom === null || (endTime !== null && endTime >= endFrom);
      const matchesEndTo = endTo === null || (endTime !== null && endTime <= endTo);
      const matchesDateRanges = matchesStartFrom && matchesStartTo && matchesEndFrom && matchesEndTo;

      const matchesColumnFilters = columns.every((column) => {
        if (column.key === 'startDate' || column.key === 'endDate') return true;
        const query = (columnFilters[column.key] ?? '').trim().toLowerCase();
        if (!query) return true;
        return getColumnValue(row, column.key, rowAtRisk).toLowerCase().includes(query);
      });

      return matchesDateRanges && matchesColumnFilters;
    });
  }, [atRiskState, columnFilters, dateRangeFilters, marketRows]);

  const sortedRows = useMemo(() => {
    const multiplier = sortState.direction === 'asc' ? 1 : -1;
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      if (sortState.key === 'submissionDate') {
        return (getSubmissionSortValue(a) - getSubmissionSortValue(b)) * multiplier;
      }
      if (sortState.key === 'status') {
        const nameA = a.status?.name ?? '';
        const nameB = b.status?.name ?? '';
        return nameA.localeCompare(nameB) * multiplier;
      }

      const dateA = sortState.key === 'startDate' ? a.startDate : a.endDate;
      const dateB = sortState.key === 'startDate' ? b.startDate : b.endDate;
      const timeA = dateA ? new Date(dateA).getTime() : Number.POSITIVE_INFINITY;
      const timeB = dateB ? new Date(dateB).getTime() : Number.POSITIVE_INFINITY;
      return (timeA - timeB) * multiplier;
    });
    return rows;
  }, [filteredRows, sortState]);

  const requestSort = (key: SortKey) => {
    setSortState((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const toggleAtRisk = (taskId: number) => {
    setAtRiskState((prev) => {
      const current = prev[taskId] ?? 'No';
      const next = current === 'Yes' ? 'No' : 'Yes';
      return { ...prev, [taskId]: next };
    });
  };

  const toggleDescription = (taskId: number) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const lastSync = new Date(snapshot.generatedAt);
  const formattedLastSync = Number.isNaN(lastSync.getTime())
    ? 'Unknown'
    : lastSync.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <AppShell
      wide
      title="Main Project View"
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
          {viewSwitcher}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
            Last sync: {formattedLastSync}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-500">
            {sortedRows.length} tasks
          </span>
        </div>
      }
    >
      <section className="space-y-1" style={{ ['--filters-offset' as string]: '64px' }}>
        <div className="overflow-x-auto overflow-y-auto rounded-[20px] border border-divider bg-white shadow-sm max-h-[calc(100vh-190px)]">
            <table className="min-w-[2270px] table-fixed border-collapse">
              <thead className="sticky top-0 z-40 bg-[#f9fafc] text-left text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400 shadow-[0_1px_0_0_#eceff3]">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="border-b border-divider px-4 py-3 align-bottom"
                      style={columnStyles[column.key]}
                    >
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className={`flex items-center gap-2 text-left text-[0.7rem] tracking-[0.15em] text-slate-500 ${
                            column.sortKey ? 'hover:text-slate-900' : 'cursor-default'
                          }`}
                          onClick={() => column.sortKey && requestSort(column.sortKey)}
                          disabled={!column.sortKey}
                        >
                          {column.label}
                          {column.sortKey && sortState.key === column.sortKey ? (
                            <span className="text-xs">
                              {sortState.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          ) : null}
                        </button>
                        {column.helper ? (
                          <span className="text-[0.65rem] font-normal capitalize text-slate-400">
                            {column.helper}
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-white">
                  {columns.map((column) => (
                    <th
                      key={`${column.key}-filter`}
                      className="border-b border-divider px-4 py-2 align-middle normal-case tracking-normal"
                      style={columnStyles[column.key]}
                    >
                      {column.key === 'startDate' ? (
                        <div className="space-y-1">
                          <input
                            type="date"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 focus:border-slate-300 focus:outline-none"
                            value={dateRangeFilters.startDateFrom}
                            onChange={(event) =>
                              setDateRangeFilters((prev) => ({ ...prev, startDateFrom: event.target.value }))
                            }
                          />
                          <input
                            type="date"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 focus:border-slate-300 focus:outline-none"
                            value={dateRangeFilters.startDateTo}
                            onChange={(event) =>
                              setDateRangeFilters((prev) => ({ ...prev, startDateTo: event.target.value }))
                            }
                          />
                        </div>
                      ) : column.key === 'endDate' ? (
                        <div className="space-y-1">
                          <input
                            type="date"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 focus:border-slate-300 focus:outline-none"
                            value={dateRangeFilters.endDateFrom}
                            onChange={(event) =>
                              setDateRangeFilters((prev) => ({ ...prev, endDateFrom: event.target.value }))
                            }
                          />
                          <input
                            type="date"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 focus:border-slate-300 focus:outline-none"
                            value={dateRangeFilters.endDateTo}
                            onChange={(event) =>
                              setDateRangeFilters((prev) => ({ ...prev, endDateTo: event.target.value }))
                            }
                          />
                        </div>
                      ) : (
                        <>
                          <input
                            list={`column-filter-${column.key}`}
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none"
                            value={columnFilters[column.key] ?? ''}
                            placeholder={`Filter ${column.label}`}
                            onChange={(event) =>
                              setColumnFilters((prev) => ({ ...prev, [column.key]: event.target.value }))
                            }
                          />
                          <datalist id={`column-filter-${column.key}`}>
                            {(columnFilterOptions[column.key] ?? []).map((option) => (
                              <option key={`${column.key}-${option}`} value={option} />
                            ))}
                          </datalist>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider text-sm text-slate-700">
                {sortedRows.map((row) => {
                  const riskValue = atRiskState[row.taskId] ?? 'No';
                  const riskRoleTone =
                    riskValue === 'Yes'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
                  const showClient =
                    row.clientAccount && row.clientAccount !== row.accountName ? row.clientAccount : null;
                  const isDescriptionExpanded = expandedDescriptions[row.taskId] ?? false;
                  return (
                    <tr key={row.taskId} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3" style={columnStyles.account}>
                        <div className="font-semibold text-slate-900">{row.accountName ?? '—'}</div>
                        {showClient ? <p className="text-xs text-slate-500">{showClient}</p> : null}
                      </td>
                      <td className="px-5 py-3" style={columnStyles.project}>
                        <p className="font-medium text-slate-900">{row.taskName}</p>
                        <p className="text-xs text-slate-400">{row.parentProjectName ?? '—'}</p>
                      </td>
                      <td className="relative overflow-visible px-5 py-3 align-top" style={columnStyles.description}>
                        <button
                          type="button"
                          className={`rounded-xl border border-transparent px-3 py-2 text-left text-sm text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 ${
                            isDescriptionExpanded
                              ? 'relative z-20 w-[420px] bg-white shadow-md'
                              : 'w-[200px]'
                          }`}
                          onDoubleClick={() => toggleDescription(row.taskId)}
                        >
                          <span className={isDescriptionExpanded ? 'block' : 'block line-clamp-1'}>
                            {row.description ? toPlainText(row.description) : '—'}
                          </span>
                        </button>
                      </td>
                      <td className="px-5 py-3" style={columnStyles.designer}>
                        {(row.designers ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(row.designers ?? []).map((person) => (
                              <Pill key={`designer-${row.taskId}-${person.id}`} tone={riskRoleTone}>
                                {person.name}
                              </Pill>
                            ))}
                          </div>
                        ) : row.designer ? (
                          <Pill tone={riskRoleTone}>{row.designer.name}</Pill>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3" style={columnStyles.strategist}>
                        {row.strategist ? (
                          <Pill tone={riskRoleTone}>{row.strategist.name}</Pill>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3" style={columnStyles.status}>
                        {row.status ? (
                          <Pill tone={statusTone(row.status.name)}>{row.status.name}</Pill>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3" style={columnStyles.invoice}>
                        {(() => {
                          if (!row.invoice) {
                            return <Pill tone="border-slate-200 bg-slate-50 text-slate-600">Not invoiced</Pill>;
                          }
                          const tone = invoiceToneMap[row.invoice.status] ?? invoiceToneMap.not_invoiced;
                          return <Pill tone={tone.tone}>{tone.label}</Pill>;
                        })()}
                      </td>
                      <td className="px-5 py-3" style={columnStyles.payment}>
                        {(() => {
                          const paymentKey = row.payment?.status ?? 'no_invoice';
                          const tone = paymentToneMap[paymentKey] ?? paymentToneMap.unknown;
                          return <Pill tone={tone.tone}>{tone.label}</Pill>;
                        })()}
                      </td>
                      <td className="px-5 py-3 text-slate-600" style={columnStyles.revenue}>
                        {formatCurrencyAed(Number(row.revenueAed ?? 0))}
                      </td>
                      <td className="px-5 py-3 text-slate-600" style={columnStyles.amountToInvoice}>
                        {formatCurrencyAed(Number(row.amountToInvoiceAed ?? 0))}
                      </td>
                      <td className="px-5 py-3 text-slate-600" style={columnStyles.startDate}>
                        {formatDate(row.startDate)}
                      </td>
                      <td className="px-5 py-3 text-slate-600" style={columnStyles.endDate}>
                        {formatDate(row.endDate)}
                      </td>
                      <td className="px-5 py-3" style={columnStyles.atRisk}>
                        <Pill
                          tone={
                            riskValue === 'Yes'
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          }
                          onClick={() => toggleAtRisk(row.taskId)}
                        >
                          {riskValue}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
        <div className="border border-t-0 border-divider bg-slate-50 px-4 py-2 text-[0.65rem] uppercase tracking-[0.25em] text-slate-400">
          {sortedRows.length} rows • Sticky header • Manual At-Risk tracking
        </div>
      </section>
    </AppShell>
  );
}
