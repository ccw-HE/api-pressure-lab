const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'api-pressure-lab.server.log');
const errPath = path.join(root, 'api-pressure-lab.server.err.log');
const pidPath = path.join(root, 'api-pressure-lab.pid');
const serverPath = path.join(root, 'server', 'index.js');

for (const file of [outPath, errPath]) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Best effort cleanup; the server can still start if logs cannot be removed.
  }
}

const out = fs.openSync(outPath, 'a');
const err = fs.openSync(errPath, 'a');

const child = spawn(process.execPath, [serverPath], {
  cwd: root,
  detached: false,
  stdio: ['ignore', out, err],
  windowsHide: true
});

fs.writeFileSync(pidPath, String(child.pid), 'ascii');
console.log(`Server PID: ${child.pid}`);

child.once('exit', () => {
  try {
    fs.rmSync(pidPath, { force: true });
  } catch {
    // Best effort cleanup.
  }
  fs.closeSync(out);
  fs.closeSync(err);
});
