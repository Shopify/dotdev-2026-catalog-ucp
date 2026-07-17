import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = path.join(root, 'runs');

fs.mkdirSync(runs, { recursive: true });
for (const entry of fs.readdirSync(runs)) {
  if (entry === '.gitkeep') continue;
  fs.rmSync(path.join(runs, entry), { recursive: true, force: true });
}
console.log('Cleared generated workshop outputs under runs/.');
