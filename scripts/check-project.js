import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = await walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax error in ${path.relative(root, file)}:\n${result.stderr}`);
  }
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
console.log(`Checked ${files.length} JavaScript files for syntax errors.`);
console.log(`Project: ${pkg.name} v${pkg.version}`);
if (failed) process.exit(1);
console.log('Static syntax check passed.');
