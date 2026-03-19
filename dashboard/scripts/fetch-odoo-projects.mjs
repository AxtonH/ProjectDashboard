import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import xmlrpc from 'xmlrpc';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.resolve(ROOT_DIR, 'src', 'data', 'odoo-projects.json');

// Load env files from project root; .env.local takes precedence for local secrets.
dotenv.config({ path: path.resolve(ROOT_DIR, '.env') });
dotenv.config({ path: path.resolve(ROOT_DIR, '.env.local'), override: true });

const config = {
  url: process.env.ODOO_URL ?? process.env.VITE_ODOO_URL,
  db: process.env.ODOO_DB ?? process.env.VITE_ODOO_DB,
  username: process.env.ODOO_USERNAME ?? process.env.VITE_ODOO_USERNAME,
  password: process.env.ODOO_PASSWORD ?? process.env.VITE_ODOO_PASSWORD,
};

for (const [key, value] of Object.entries(config)) {
  if (!value) {
    console.error(`Missing required environment variable for ${key}. Check .env.local or .env file.`);
    process.exit(1);
  }
}

const requiredTaskFields = [
  'name',
  'project_id',
  'description',
  'sale_line_id',
  'user_ids',
  'x_studio_designer',
  'stage_id',
  'state',
  'date_deadline',
  'x_studio_internal_due_date_1',
  'x_studio_client_due_date_3',
  'x_studio_submission_date_time_1',
  'x_studio_request_receipt_date_time',
  'parent_id',
];

const projectFields = ['name', 'partner_id', 'sale_order_id', 'tag_ids', 'x_studio_market_2'];
const saleOrderFields = ['name', 'state', 'invoice_status', 'project_id', 'project_ids', 'invoice_ids', 'x_studio_aed_amount_to_invoice', 'x_studio_aed_total'];
const saleOrderLineFields = ['order_id', 'product_uom_qty', 'qty_invoiced', 'price_subtotal', 'price_total'];
const accountMoveFields = ['payment_state', 'state', 'move_type'];
const userFields = ['name'];
const planningSlotFields = [
  'project_id',
  'resource_id',
  'role_id',
  'x_studio_parent_task',
  'start_datetime',
  'end_datetime',
];
const planningAvailabilityFields = ['project_id', 'resource_id', 'role_id', 'start_datetime', 'end_datetime', 'allocated_hours'];
const employeeFields = ['name', 'resource_id', 'department_id', 'active'];
const projectTagFields = ['name'];

const isSecure = config.url.startsWith('https://');
const createClient = (endpoint) =>
  (isSecure ? xmlrpc.createSecureClient : xmlrpc.createClient)({
    url: `${config.url}${endpoint}`,
  });

const commonClient = createClient('/xmlrpc/2/common');
const objectClient = createClient('/xmlrpc/2/object');

const callRpc = (client, method, params = []) =>
  new Promise((resolve, reject) => {
    client.methodCall(method, params, (error, value) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    });
  });

const executeKw = (model, method, args = [], kwargs = {}) =>
  callRpc(objectClient, 'execute_kw', [config.db, globalUid, config.password, model, method, args, kwargs]);

let globalUid;

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }
  return `${value}Z`;
};

async function fetchTaskData(projectIds) {
  if (!projectIds.length) {
    return [];
  }
  const domain = [
    ['parent_id', '=', false],
    ['project_id', 'in', projectIds],
  ];
  return executeKw(
    'project.task',
    'search_read',
    [domain],
    {
      fields: requiredTaskFields,
      order: 'x_studio_internal_due_date_1 asc',
      limit: 10000,
    },
  );
}

async function fetchProjects(projectIds) {
  if (!projectIds.length) {
    return [];
  }
  return executeKw('project.project', 'read', [projectIds, projectFields]);
}

async function fetchNonKeyProjects() {
  const tags = await executeKw(
    'project.tags',
    'search_read',
    [[['name', 'ilike', 'non-key account']]],
    {
      fields: projectTagFields,
      limit: 100,
    },
  );
  const tagIds = tags.map((tag) => tag.id);
  if (!tagIds.length) {
    return [];
  }
  return executeKw(
    'project.project',
    'search_read',
    [[['tag_ids', 'in', tagIds]]],
    {
      fields: projectFields,
      limit: 10000,
    },
  );
}

async function fetchProjectTags(projectTagIds) {
  if (!projectTagIds.length) {
    return [];
  }
  return executeKw('project.tags', 'read', [projectTagIds, projectTagFields]);
}

async function fetchSaleOrders(saleOrderIds) {
  if (!saleOrderIds.length) {
    return [];
  }
  return executeKw('sale.order', 'read', [saleOrderIds, saleOrderFields]);
}

async function fetchSaleOrdersForProjects(projectIds) {
  if (!projectIds.length) {
    return [];
  }
  return executeKw(
    'sale.order',
    'search_read',
    [[
      '|',
      ['project_id', 'in', projectIds],
      ['project_ids', 'in', projectIds],
    ]],
    {
      fields: saleOrderFields,
      limit: 10000,
      order: 'id desc',
    },
  );
}

async function fetchSaleOrderLines(saleOrderIds) {
  if (!saleOrderIds.length) {
    return [];
  }
  return executeKw(
    'sale.order.line',
    'search_read',
    [[['order_id', 'in', saleOrderIds]]],
    {
      fields: saleOrderLineFields,
      limit: 100000,
    },
  );
}

async function fetchSaleOrderLinesByIds(saleOrderLineIds) {
  if (!saleOrderLineIds.length) {
    return [];
  }
  return executeKw('sale.order.line', 'read', [saleOrderLineIds, saleOrderLineFields]);
}

async function fetchAccountMoves(moveIds) {
  if (!moveIds.length) {
    return [];
  }
  return executeKw('account.move', 'read', [moveIds, accountMoveFields]);
}

async function fetchUsers(userIds) {
  if (!userIds.length) {
    return [];
  }
  return executeKw('res.users', 'read', [userIds, userFields]);
}

async function fetchPlanningSlots(projectIds) {
  if (!projectIds.length) {
    return [];
  }
  return executeKw(
    'planning.slot',
    'search_read',
    [[['project_id', 'in', projectIds]]],
    {
      fields: planningSlotFields,
    },
  );
}

async function fetchPlanningSlotsForAvailability() {
  return executeKw(
    'planning.slot',
    'search_read',
    [[['project_id', '!=', false], ['resource_id', '!=', false], ['role_id', '!=', false]]],
    {
      fields: planningAvailabilityFields,
    },
  );
}

async function fetchCreativeEmployees() {
  const employees = await executeKw(
    'hr.employee',
    'search_read',
    [[['resource_id', '!=', false], ['department_id', '!=', false], ['active', '=', true]]],
    {
      fields: employeeFields,
      limit: 10000,
    },
  );

  return employees.filter((employee) => {
    const deptName = employee.department_id?.[1]?.trim().toLowerCase() ?? '';
    return deptName === 'creative' || deptName === 'creative strategy';
  });
}

function buildMap(records) {
  return new Map(records.map((record) => [record.id, record]));
}

function extractUniqueIds(tasks) {
  const projectIds = new Set();
  const saleOrderIds = new Set();
  const userIds = new Set();

  for (const task of tasks) {
    const projectId = task.project_id?.[0];
    if (projectId) {
      projectIds.add(projectId);
    }

    for (const designerId of task.x_studio_designer ?? []) {
      userIds.add(designerId);
    }

    for (const userId of task.user_ids ?? []) {
      userIds.add(userId);
    }
  }

  return { projectIds: [...projectIds], saleOrderIds, userIds: [...userIds] };
}

function collectSaleOrderIds(projects, saleOrderIdsSet) {
  for (const project of projects) {
    const saleOrderId = project.sale_order_id?.[0];
    if (saleOrderId) {
      saleOrderIdsSet.add(saleOrderId);
    }
  }
  return [...saleOrderIdsSet];
}

function buildProjectSaleOrderMap(projects, linkedSaleOrders) {
  const map = new Map();

  for (const project of projects) {
    const directSaleOrderId = project.sale_order_id?.[0];
    if (directSaleOrderId) {
      map.set(project.id, directSaleOrderId);
    }
  }

  for (const order of linkedSaleOrders) {
    const primaryProjectId = order.project_id?.[0];
    if (primaryProjectId && !map.has(primaryProjectId)) {
      map.set(primaryProjectId, order.id);
    }
    for (const relatedProjectId of order.project_ids ?? []) {
      if (relatedProjectId && !map.has(relatedProjectId)) {
        map.set(relatedProjectId, order.id);
      }
    }
  }

  return map;
}

function classifyInvoiceStatus(quantityTotal, quantityInvoiced) {
  const eps = 0.000001;
  if (Math.abs(quantityInvoiced) <= eps) {
    return { status: 'not_invoiced', label: 'Not invoiced' };
  }
  if (Math.abs(quantityInvoiced - quantityTotal) <= eps || quantityInvoiced > quantityTotal) {
    return { status: 'invoiced', label: 'Invoiced' };
  }
  if (Math.abs(quantityInvoiced * 2 - quantityTotal) <= eps || quantityInvoiced < quantityTotal) {
    return { status: 'half_invoiced', label: '50% invoiced' };
  }
  return { status: 'not_invoiced', label: 'Not invoiced' };
}

function buildSaleOrderInvoiceMap(saleOrderLines) {
  const map = new Map();
  for (const line of saleOrderLines) {
    const orderId = line.order_id?.[0];
    if (!orderId) continue;
    const quantity = Number(line.product_uom_qty ?? 0);
    const invoiced = Number(line.qty_invoiced ?? 0);
    if (!map.has(orderId)) {
      map.set(orderId, { quantityTotal: 0, quantityInvoiced: 0 });
    }
    const entry = map.get(orderId);
    entry.quantityTotal += Number.isFinite(quantity) ? quantity : 0;
    entry.quantityInvoiced += Number.isFinite(invoiced) ? invoiced : 0;
  }

  const result = new Map();
  for (const [orderId, entry] of map.entries()) {
    const classified = classifyInvoiceStatus(entry.quantityTotal, entry.quantityInvoiced);
    result.set(orderId, {
      quantityTotal: entry.quantityTotal,
      quantityInvoiced: entry.quantityInvoiced,
      status: classified.status,
      statusLabel: classified.label,
    });
  }
  return result;
}

function buildSaleOrderLineToOrderMap(saleOrderLines) {
  const map = new Map();
  for (const line of saleOrderLines) {
    const lineId = line.id;
    const orderId = line.order_id?.[0];
    if (lineId && orderId) {
      map.set(lineId, orderId);
    }
  }
  return map;
}

function buildSaleOrderRevenueMap(saleOrders) {
  const map = new Map();
  for (const order of saleOrders) {
    const amount = Number(order.x_studio_aed_total ?? 0);
    map.set(order.id, Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0);
  }
  return map;
}

function buildSaleOrderAmountToInvoiceMap(saleOrders) {
  const map = new Map();
  for (const order of saleOrders) {
    const amount = Number(order.x_studio_aed_amount_to_invoice ?? 0);
    map.set(order.id, Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0);
  }
  return map;
}

function labelForPaymentState(state) {
  if (state === 'paid') return { status: 'paid', statusLabel: 'Paid' };
  if (state === 'in_payment') return { status: 'in_payment', statusLabel: 'In Payment' };
  if (state === 'partial') return { status: 'partial', statusLabel: 'Partially Paid' };
  if (state === 'not_paid') return { status: 'not_paid', statusLabel: 'Not Paid' };
  if (state === 'reversed') return { status: 'reversed', statusLabel: 'Reversed' };
  return { status: 'unknown', statusLabel: 'Unknown' };
}

function buildSaleOrderPaymentMap(saleOrders, accountMoves) {
  const moveMap = new Map(accountMoves.map((move) => [move.id, move]));
  const result = new Map();

  for (const order of saleOrders) {
    const invoiceIds = (order.invoice_ids ?? [])
      .map((value) => (Array.isArray(value) ? value[0] : value))
      .filter((id) => Number.isFinite(id));

    if (!invoiceIds.length) {
      result.set(order.id, { status: 'no_invoice', statusLabel: 'No Invoice' });
      continue;
    }

    const invoices = invoiceIds
      .map((id) => moveMap.get(id))
      .filter(Boolean)
      .filter((move) => move.state === 'posted' && (move.move_type === 'out_invoice' || move.move_type === 'out_refund'));

    if (!invoices.length) {
      result.set(order.id, { status: 'unknown', statusLabel: 'Unknown' });
      continue;
    }

    const states = invoices.map((move) => move.payment_state);
    if (states.every((state) => state === 'paid')) {
      result.set(order.id, { status: 'paid', statusLabel: 'Paid' });
      continue;
    }
    if (states.includes('in_payment')) {
      result.set(order.id, { status: 'in_payment', statusLabel: 'In Payment' });
      continue;
    }
    if (states.includes('partial')) {
      result.set(order.id, { status: 'partial', statusLabel: 'Partially Paid' });
      continue;
    }
    if (states.includes('not_paid')) {
      result.set(order.id, { status: 'not_paid', statusLabel: 'Not Paid' });
      continue;
    }
    if (states.includes('reversed')) {
      result.set(order.id, { status: 'reversed', statusLabel: 'Reversed' });
      continue;
    }

    result.set(order.id, labelForPaymentState(states[0]));
  }

  return result;
}

const normalizeRole = (roleName) => (typeof roleName === 'string' ? roleName.trim().toLowerCase() : '');
const normalizeTagName = (tagName) =>
  (typeof tagName === 'string' ? tagName : '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const isNonKeyAccountTag = (tagName) => normalizeTagName(tagName) === 'nonkeyaccount';

const isDesignerRole = (roleName) => {
  const value = normalizeRole(roleName);
  return value.includes('designer') || value.includes('design');
};

const isStrategistRole = (roleName) => normalizeRole(roleName).includes('strategist');

function buildRoleMap(slots, roleMatcher, keySelector) {
  const map = new Map();
  const now = Date.now();

  for (const slot of slots) {
    const keyId = keySelector(slot);
    const resourceId = slot.resource_id?.[0];
    const resourceName = slot.resource_id?.[1];

    if (!keyId || !resourceId || !resourceName) {
      continue;
    }

    const currentRoleName = slot.role_id?.[1]?.trim() ?? null;
    if (typeof currentRoleName !== 'string' || !roleMatcher(currentRoleName)) {
      continue;
    }

    const candidate = {
      id: resourceId,
      name: resourceName,
      role: currentRoleName,
      start: parseDate(slot.start_datetime ?? null),
      end: parseDate(slot.end_datetime ?? null),
      slotId: slot.id ?? 0,
    };

    const existing = map.get(keyId);
    if (!existing || isPreferredRoleSlot(candidate, existing, now)) {
      map.set(keyId, candidate);
    }
  }

  const normalized = new Map();
  for (const [key, value] of map.entries()) {
    normalized.set(key, {
      id: value.id,
      name: value.name,
      role: value.role,
    });
  }

  return normalized;
}

function buildRoleListMap(slots, roleMatcher, keySelector) {
  const map = new Map();

  for (const slot of slots) {
    const keyId = keySelector(slot);
    const resourceId = slot.resource_id?.[0];
    const resourceName = slot.resource_id?.[1];

    if (!keyId || !resourceId || !resourceName) {
      continue;
    }

    const currentRoleName = slot.role_id?.[1]?.trim() ?? null;
    if (typeof currentRoleName !== 'string' || !roleMatcher(currentRoleName)) {
      continue;
    }

    if (!map.has(keyId)) {
      map.set(keyId, new Map());
    }

    const roleMap = map.get(keyId);
    if (!roleMap.has(resourceId)) {
      roleMap.set(resourceId, {
        id: resourceId,
        name: resourceName,
        role: currentRoleName,
      });
    }
  }

  const normalized = new Map();
  for (const [key, roleMap] of map.entries()) {
    normalized.set(
      key,
      Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  return normalized;
}

function parseDate(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const date = new Date(`${value}Z`);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function classifyRoleSlot(slot, now) {
  if (slot.start !== null && slot.end !== null && slot.start <= now && slot.end >= now) {
    return { tier: 0, distance: 0 };
  }
  if (slot.end !== null && slot.end < now) {
    return { tier: 1, distance: now - slot.end };
  }
  if (slot.start !== null && slot.start > now) {
    return { tier: 2, distance: slot.start - now };
  }
  return { tier: 3, distance: Number.POSITIVE_INFINITY };
}

function isPreferredRoleSlot(candidate, existing, now) {
  const nextRank = classifyRoleSlot(candidate, now);
  const currentRank = classifyRoleSlot(existing, now);

  if (nextRank.tier !== currentRank.tier) {
    return nextRank.tier < currentRank.tier;
  }
  if (nextRank.distance !== currentRank.distance) {
    return nextRank.distance < currentRank.distance;
  }

  return candidate.slotId > existing.slotId;
}

function overlapsWindow(start, end, windowStart, windowEnd) {
  if (start !== null && end !== null) {
    return start <= windowEnd && end >= windowStart;
  }
  if (start !== null) {
    return start >= windowStart && start <= windowEnd;
  }
  if (end !== null) {
    return end >= windowStart && end <= windowEnd;
  }
  return false;
}

function prorateHoursToWindow(allocatedHours, start, end, windowStart, windowEnd) {
  if (!Number.isFinite(allocatedHours) || allocatedHours <= 0) {
    return 0;
  }

  // If timing is incomplete or invalid, keep legacy behavior and count full slot hours.
  if (start === null || end === null || end <= start) {
    return allocatedHours;
  }

  const overlapStart = Math.max(start, windowStart);
  const overlapEnd = Math.min(end, windowEnd);
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  if (overlapMs <= 0) {
    return 0;
  }

  const totalMs = end - start;
  return allocatedHours * (overlapMs / totalMs);
}

function buildCreativeAvailability(planningSlots, projectMap, allowedProjectIds, marketFilter = 'all') {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const windowStart = now - sevenDaysMs;
  const windowEnd = now;
  const map = new Map();

  for (const slot of planningSlots) {
    const projectId = slot.project_id?.[0];
    if (!projectId || !allowedProjectIds.has(projectId)) continue;
    const roleName = slot.role_id?.[1]?.trim() ?? '';
    if (!isDesignerRole(roleName)) continue;

    const projectRecord = projectMap.get(projectId);
    const projectMarket = projectRecord?.x_studio_market_2?.[1]?.trim().toUpperCase() ?? '';
    if (marketFilter !== 'all' && !projectMarket.includes(marketFilter)) continue;

    const resourceId = slot.resource_id?.[0];
    const resourceName = slot.resource_id?.[1] ?? 'Unknown';
    if (!resourceId) continue;

    if (!map.has(resourceId)) {
      map.set(resourceId, {
        id: resourceId,
        name: resourceName,
        projectsPast7Days: new Set(),
        hoursPast7Days: 0,
      });
    }

    const start = parseDate(slot.start_datetime ?? null);
    const end = parseDate(slot.end_datetime ?? null);

    if (!overlapsWindow(start, end, windowStart, windowEnd)) {
      continue;
    }

    const projectName = slot.project_id?.[1] ?? null;
    if (projectName) {
      map.get(resourceId).projectsPast7Days.add(projectName);
    }
    const allocatedHours = Number(slot.allocated_hours ?? 0);
    const proratedHours = prorateHoursToWindow(allocatedHours, start, end, windowStart, windowEnd);
    if (proratedHours > 0) {
      map.get(resourceId).hoursPast7Days += proratedHours;
    }
  }

  return Array.from(map.values())
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      projectsPast7Days: entry.projectsPast7Days.size,
      projectNamesPast7Days: Array.from(entry.projectsPast7Days).sort((a, b) => a.localeCompare(b)),
      hoursPast7Days: Number(entry.hoursPast7Days.toFixed(2)),
    }))
    .sort((a, b) => {
      if (b.projectsPast7Days !== a.projectsPast7Days) {
        return b.projectsPast7Days - a.projectsPast7Days;
      }
      if (b.hoursPast7Days !== a.hoursPast7Days) {
        return b.hoursPast7Days - a.hoursPast7Days;
      }
      return a.name.localeCompare(b.name);
    });
}

function normalizeTasks(
  tasks,
  projectMap,
  saleOrderMap,
  saleOrderInvoiceMap,
  saleOrderRevenueMap,
  saleOrderAmountToInvoiceMap,
  saleOrderPaymentMap,
  projectSaleOrderMap,
  saleOrderLineToOrderMap,
  userMap,
  strategistMap,
  designerRoleListMap,
) {
  return tasks.map((task) => {
    const taskId = task.id;
    const projectId = task.project_id?.[0];
    const projectRecord = projectMap.get(projectId);
    const taskSaleLineId = task.sale_line_id?.[0];
    const saleOrderIdFromTask = taskSaleLineId ? saleOrderLineToOrderMap.get(taskSaleLineId) : undefined;
    const saleOrderId = saleOrderIdFromTask ?? (projectId ? projectSaleOrderMap.get(projectId) : undefined);
    const saleOrderRecord = saleOrderId ? saleOrderMap.get(saleOrderId) : undefined;
    const invoiceSummary = saleOrderId ? saleOrderInvoiceMap.get(saleOrderId) : undefined;
    const revenueAed = saleOrderId ? Number(saleOrderRevenueMap.get(saleOrderId) ?? 0) : 0;
    const amountToInvoiceAed = saleOrderId ? Number(saleOrderAmountToInvoiceMap.get(saleOrderId) ?? 0) : 0;
    const paymentSummary = saleOrderId ? saleOrderPaymentMap.get(saleOrderId) : undefined;

    const designerFromTaskRole = designerRoleListMap.get(taskId) ?? [];
    const designerFromTask = (task.x_studio_designer ?? [])
      .map((userId) => userMap.get(userId))
      .filter(Boolean)
      .map((user) => ({ id: user.id, name: user.name }));
    const designersMap = new Map();
    for (const person of designerFromTaskRole) {
      designersMap.set(person.id, { id: person.id, name: person.name });
    }
    for (const person of designerFromTask) {
      designersMap.set(person.id, { id: person.id, name: person.name });
    }
    const normalizedDesigners = Array.from(designersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const primaryDesigner = normalizedDesigners[0] ?? null;

    const isCanceled = typeof task.state === 'string' && task.state.toLowerCase().includes('cancel');
    const normalizedStatus = isCanceled
      ? { id: -1, name: 'Canceled' }
      : (task.stage_id
        ? { id: task.stage_id[0], name: task.stage_id[1] }
        : null);

    return {
      taskId: task.id,
      taskName: task.name ?? '—',
      parentProjectName: task.project_id?.[1] ?? null,
      accountName: projectRecord?.partner_id?.[1] ?? projectRecord?.name ?? null,
      clientAccount: projectRecord?.partner_id?.[1] ?? null,
      market: projectRecord?.x_studio_market_2?.[1] ?? null,
      description: task.description ?? '',
      designer: primaryDesigner,
      designers: normalizedDesigners,
      strategist: strategistMap.get(taskId) ?? null,
      status: normalizedStatus,
      invoice: saleOrderRecord
        ? {
            id: saleOrderRecord.id,
            label: saleOrderRecord.name,
            status: invoiceSummary?.status ?? 'not_invoiced',
            statusLabel: invoiceSummary?.statusLabel ?? 'Not invoiced',
            quantityTotal: invoiceSummary?.quantityTotal ?? 0,
            quantityInvoiced: invoiceSummary?.quantityInvoiced ?? 0,
          }
        : null,
      saleOrderState: saleOrderRecord?.state ?? null,
      payment: paymentSummary ?? null,
      revenueAed,
      amountToInvoiceAed,
      startDate: normalizeDate(task.x_studio_request_receipt_date_time ?? task.date_deadline),
      endDate: normalizeDate(task.x_studio_internal_due_date_1),
      clientDueDate: normalizeDate(task.x_studio_client_due_date_3),
      submissionDate: normalizeDate(task.x_studio_submission_date_time_1),
    };
  });
}

async function main() {
  try {
    console.log('Connecting to Odoo…');
    const versionInfo = await callRpc(commonClient, 'version', []);
    console.log(`Odoo version ${versionInfo.server_version}`);

    globalUid = await callRpc(commonClient, 'authenticate', [
      config.db,
      config.username,
      config.password,
      {},
    ]);

    if (!globalUid) {
      throw new Error('Authentication failed. Check Odoo credentials.');
    }
    console.log(`Authenticated as UID ${globalUid}`);

    const projects = await fetchNonKeyProjects();
    console.log(`Fetched ${projects.length} Non-Key Account project.project records`);
    const projectIds = projects.map((project) => project.id);
    const allowedProjectIds = new Set(projectIds);

    const tasks = await fetchTaskData(projectIds);
    console.log(`Fetched ${tasks.length} project.task records for Non-Key Account projects`);

    const { userIds } = extractUniqueIds(tasks);
    const directSaleOrderIds = collectSaleOrderIds(projects, new Set());
    const saleOrdersByProject = await fetchSaleOrdersForProjects(projectIds);
    const mergedSaleOrders = [...saleOrdersByProject];
    const seenSaleOrderIds = new Set(mergedSaleOrders.map((order) => order.id));
    if (directSaleOrderIds.length) {
      const directSaleOrders = await fetchSaleOrders(directSaleOrderIds);
      for (const order of directSaleOrders) {
        if (!seenSaleOrderIds.has(order.id)) {
          mergedSaleOrders.push(order);
          seenSaleOrderIds.add(order.id);
        }
      }
    }
    console.log(`Fetched ${mergedSaleOrders.length} linked sale.order records`);
    const taskSaleLineIds = Array.from(
      new Set(
        tasks
          .map((task) => task.sale_line_id?.[0])
          .filter((id) => Number.isFinite(id)),
      ),
    );

    const saleOrderLines = await fetchSaleOrderLines([...seenSaleOrderIds]);
    const seenSaleOrderLineIds = new Set(saleOrderLines.map((line) => line.id));
    const missingTaskSaleLineIds = taskSaleLineIds.filter((id) => !seenSaleOrderLineIds.has(id));
    if (missingTaskSaleLineIds.length) {
      const additionalTaskLines = await fetchSaleOrderLinesByIds(missingTaskSaleLineIds);
      for (const line of additionalTaskLines) {
        if (!seenSaleOrderLineIds.has(line.id)) {
          saleOrderLines.push(line);
          seenSaleOrderLineIds.add(line.id);
        }
      }
    }
    console.log(`Fetched ${saleOrderLines.length} sale.order.line records`);
    const saleOrderIdsFromLines = Array.from(
      new Set(
        saleOrderLines
          .map((line) => line.order_id?.[0])
          .filter((id) => Number.isFinite(id)),
      ),
    );
    const missingSaleOrderIds = saleOrderIdsFromLines.filter((id) => !seenSaleOrderIds.has(id));
    if (missingSaleOrderIds.length) {
      const extraOrders = await fetchSaleOrders(missingSaleOrderIds);
      for (const order of extraOrders) {
        if (!seenSaleOrderIds.has(order.id)) {
          mergedSaleOrders.push(order);
          seenSaleOrderIds.add(order.id);
        }
      }
    }
    const invoiceIds = Array.from(
      new Set(
        mergedSaleOrders
          .flatMap((order) => order.invoice_ids ?? [])
          .map((value) => (Array.isArray(value) ? value[0] : value))
          .filter((id) => Number.isFinite(id)),
      ),
    );
    const accountMoves = await fetchAccountMoves(invoiceIds);
    console.log(`Fetched ${accountMoves.length} account.move records for payment states`);

    const users = await fetchUsers(userIds);
    console.log(`Fetched ${users.length} res.users records`);

    const planningSlots = await fetchPlanningSlots(projectIds);
    console.log(`Fetched ${planningSlots.length} planning.slot records for task projects`);
    const availabilitySlots = await fetchPlanningSlotsForAvailability();
    console.log(`Fetched ${availabilitySlots.length} planning.slot records for availability`);
    const creativeEmployees = await fetchCreativeEmployees();
    console.log(`Fetched ${creativeEmployees.length} active Creative / Creative Strategy employees`);

    const projectMap = buildMap(projects);
    const saleOrderMap = buildMap(mergedSaleOrders);
    const saleOrderInvoiceMap = buildSaleOrderInvoiceMap(saleOrderLines);
    const saleOrderRevenueMap = buildSaleOrderRevenueMap(mergedSaleOrders);
    const saleOrderAmountToInvoiceMap = buildSaleOrderAmountToInvoiceMap(mergedSaleOrders);
    const saleOrderPaymentMap = buildSaleOrderPaymentMap(mergedSaleOrders, accountMoves);
    const projectSaleOrderMap = buildProjectSaleOrderMap(projects, mergedSaleOrders);
    const saleOrderLineToOrderMap = buildSaleOrderLineToOrderMap(saleOrderLines);
    const userMap = buildMap(users);
    const strategistMap = buildRoleMap(
      planningSlots,
      isStrategistRole,
      (slot) => slot.x_studio_parent_task?.[0] ?? null,
    );
    const designerRoleListMap = buildRoleListMap(
      planningSlots,
      isDesignerRole,
      (slot) => slot.x_studio_parent_task?.[0] ?? null,
    );
    const designerAvailabilityAll = buildCreativeAvailability(
      availabilitySlots,
      projectMap,
      allowedProjectIds,
      'all',
    );
    const designerAvailabilityUAE = buildCreativeAvailability(
      availabilitySlots,
      projectMap,
      allowedProjectIds,
      'UAE',
    );
    const designerAvailabilityKSA = buildCreativeAvailability(
      availabilitySlots,
      projectMap,
      allowedProjectIds,
      'KSA',
    );

    const normalized = normalizeTasks(
      tasks,
      projectMap,
      saleOrderMap,
      saleOrderInvoiceMap,
      saleOrderRevenueMap,
      saleOrderAmountToInvoiceMap,
      saleOrderPaymentMap,
      projectSaleOrderMap,
      saleOrderLineToOrderMap,
      userMap,
      strategistMap,
      designerRoleListMap,
    );

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(
      OUTPUT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: {
            tasks: tasks.length,
            projects: projects.length,
            saleOrders: mergedSaleOrders.length,
            users: users.length,
            planningSlots: planningSlots.length,
            planningSlotsAvailability: availabilitySlots.length,
            designerCards: designerAvailabilityAll.length,
            creativeEmployees: creativeEmployees.length,
          },
          rows: normalized,
          designerAvailability: designerAvailabilityAll,
          designerAvailabilityByMarket: {
            all: designerAvailabilityAll,
            uae: designerAvailabilityUAE,
            ksa: designerAvailabilityKSA,
          },
        },
        null,
        2,
      ),
    );

    console.log(`Snapshot written to ${OUTPUT_PATH}`);
  } catch (error) {
    console.error('Failed to fetch Odoo data:', error.message);
    process.exit(1);
  }
}

main();
