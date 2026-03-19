import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dashboardDir = path.resolve(__dirname, 'dashboard');
const distDir = path.resolve(dashboardDir, 'dist');
const fetchScript = path.resolve(dashboardDir, 'scripts', 'fetch-odoo-projects.mjs');
const snapshotPath = path.resolve(dashboardDir, 'src', 'data', 'odoo-projects.json');
const port = Number(process.env.PORT ?? 3000);

const parseBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
};

const refreshOnRequest = parseBoolean(process.env.ODOO_REFRESH_ON_REQUEST, true);
const allowStaleFallback = parseBoolean(process.env.ODOO_ALLOW_STALE_FALLBACK, false);
let activeSync = null;

const contentTypeByExtension = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const readSnapshot = async () => {
  const raw = await fs.readFile(snapshotPath, 'utf8');
  return JSON.parse(raw);
};

const runSync = () => {
  if (activeSync) {
    return activeSync;
  }

  activeSync = new Promise((resolve, reject) => {
    const task = spawn(process.execPath, [fetchScript], {
      cwd: dashboardDir,
      stdio: 'inherit',
    });

    task.on('error', reject);
    task.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`fetch-odoo-projects exited with code ${code ?? 'unknown'}`));
      }
    });
  }).finally(() => {
    activeSync = null;
  });

  return activeSync;
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const serveFile = async (response, filePath) => {
  try {
    const data = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypeByExtension[extension] ?? 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    response.end(data);
    return true;
  } catch {
    return false;
  }
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (requestUrl.pathname === '/api/odoo-snapshot') {
      try {
        if (refreshOnRequest) {
          await runSync();
        }
        const snapshot = await readSnapshot();
        return sendJson(response, 200, snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        if (!allowStaleFallback) {
          return sendJson(response, 503, {
            error: 'Live Odoo sync failed. Stale fallback is disabled.',
            detail: message,
          });
        }
        try {
          const fallback = await readSnapshot();
          response.setHeader('X-Odoo-Snapshot-Stale', 'true');
          response.setHeader('X-Odoo-Snapshot-Error', message);
          return sendJson(response, 200, fallback);
        } catch {
          return sendJson(response, 500, {
            error: 'Failed to refresh and failed to load fallback snapshot.',
          });
        }
      }
    }

    const cleanedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = cleanedPath === '/' ? 'index.html' : cleanedPath.replace(/^\/+/, '');
    const candidatePath = path.resolve(distDir, relativePath);

    if (candidatePath.startsWith(distDir) && await serveFile(response, candidatePath)) {
      return;
    }

    const indexPath = path.resolve(distDir, 'index.html');
    if (await serveFile(response, indexPath)) {
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal Server Error');
  }
});

server.listen(port, () => {
  console.log(`Server listening on ${port}`);
  console.log(`Refresh-on-request: ${refreshOnRequest ? 'enabled' : 'disabled'}`);
  console.log(`Stale-fallback: ${allowStaleFallback ? 'enabled' : 'disabled'}`);
});
