export type PersonRole = {
  id: number;
  name: string;
  role?: string;
};

export type InvoiceInfo = {
  id: number;
  label: string;
  status: 'not_invoiced' | 'half_invoiced' | 'invoiced';
  statusLabel: string;
  quantityTotal?: number;
  quantityInvoiced?: number;
};

export type StatusInfo = {
  id: number;
  name: string;
};

export type ProjectRow = {
  taskId: number;
  taskName: string;
  parentProjectName: string | null;
  accountName: string | null;
  clientAccount: string | null;
  market: string | null;
  description: string;
  designer: PersonRole | null;
  designers?: PersonRole[];
  strategist: PersonRole | null;
  status: StatusInfo | null;
  invoice: InvoiceInfo | null;
  startDate: string | null;
  endDate: string | null;
  submissionDate: string | null;
};

export type OdooSnapshot = {
  generatedAt: string;
  source: {
    tasks: number;
    projects: number;
    saleOrders: number;
    users: number;
    planningSlots?: number;
    planningSlotsAvailability?: number;
    designerCards?: number;
    creativeEmployees?: number;
  };
  rows: ProjectRow[];
  designerAvailability?: {
    id: number;
    name: string;
    projectsPast7Days: number;
    projectNamesPast7Days: string[];
    hoursPast7Days?: number;
  }[];
  designerAvailabilityByMarket?: {
    all: {
      id: number;
      name: string;
      projectsPast7Days: number;
      projectNamesPast7Days: string[];
      hoursPast7Days?: number;
    }[];
    uae: {
      id: number;
      name: string;
      projectsPast7Days: number;
      projectNamesPast7Days: string[];
      hoursPast7Days?: number;
    }[];
    ksa: {
      id: number;
      name: string;
      projectsPast7Days: number;
      projectNamesPast7Days: string[];
      hoursPast7Days?: number;
    }[];
  };
};
