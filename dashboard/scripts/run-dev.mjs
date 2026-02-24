import { spawn } from 'node:child_process';
import path from 'node:path';

const viteBin = path.resolve('node_modules', 'vite', 'bin', 'vite.js');

const task = spawn(process.execPath, [viteBin], {
  stdio: 'inherit',
});

task.on('close', (code) => {
  process.exit(code ?? 0);
});
