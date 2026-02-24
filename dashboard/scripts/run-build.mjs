import { spawn } from 'node:child_process';
import path from 'node:path';

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const task = spawn(command, args, { stdio: 'inherit' });
    task.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${args.join(' ')} exited with code ${code}`));
      }
    });
  });

const tscBin = path.resolve('node_modules', 'typescript', 'bin', 'tsc');
const viteBin = path.resolve('node_modules', 'vite', 'bin', 'vite.js');

async function main() {
  await run(process.execPath, [tscBin, '-b']);
  await run(process.execPath, [viteBin, 'build']);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
