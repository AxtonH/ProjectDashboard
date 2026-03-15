import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const viteBin = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
const fetchScript = path.resolve('scripts', 'fetch-odoo-projects.mjs');

const parseBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
};

const parseInterval = (value, fallbackMs) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 5000) {
    return fallbackMs;
  }
  return Math.floor(parsed);
};

const syncEnabled = parseBoolean(process.env.ODOO_LIVE_SYNC, true);
const syncIntervalMs = parseInterval(process.env.ODOO_SYNC_INTERVAL_MS, 60000);

let isShuttingDown = false;
let isSyncRunning = false;
let syncTimer = null;
let viteTask = null;

const runSync = (reason) => {
  if (!syncEnabled || isShuttingDown || isSyncRunning) {
    return;
  }

  isSyncRunning = true;
  console.log(`[odoo-sync] Starting ${reason} sync...`);

  const syncTask = spawn(process.execPath, [fetchScript], { stdio: 'inherit' });
  syncTask.on('close', (code) => {
    if (code === 0) {
      console.log('[odoo-sync] Sync complete.');
    } else {
      console.error(`[odoo-sync] Sync failed (exit ${code ?? 'unknown'}). Will retry.`);
    }
    isSyncRunning = false;
  });
};

const stopAll = () => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  if (viteTask && !viteTask.killed) {
    viteTask.kill('SIGTERM');
  }
};

viteTask = spawn(process.execPath, [viteBin], {
  stdio: 'inherit',
});

if (syncEnabled) {
  runSync('startup');
  syncTimer = setInterval(() => {
    runSync('scheduled');
  }, syncIntervalMs);
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

viteTask.on('close', (code) => {
  stopAll();
  process.exit(code ?? 0);
});
