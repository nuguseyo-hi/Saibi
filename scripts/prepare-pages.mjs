import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// The game keeps root-relative asset paths for its original host. Adapt only the
// compiled Pages artifact; the game source and original deployment stay intact.
const base = process.argv[2] ?? '/Saibi/';
const output = resolve(process.argv[3] ?? 'dist');
if (!/^\/[A-Za-z0-9_-]+\/$/.test(base)) throw new Error('Expected a Pages base such as /Saibi/.');
const index = await readFile(join(output, 'index.html'), 'utf8');
if (!index.includes(`${base}assets/`) || !(await stat(join(output, 'assets'))).isDirectory()) {
  throw new Error('Build first with the matching Vite --base; pass the compiled output directory.');
}
let changed = 0;
async function prepare(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await prepare(file);
    else if (/\.(js|css|html|json)$/.test(entry.name)) {
      const before = await readFile(file, 'utf8');
      const escapedBase = base.replaceAll('/', String.raw`\/`);
      // Keep the existing strict asset-path validators, mounted at the same
      // prefix as the compiled data. No validation rule is removed or relaxed.
      let after = before.replace(/(["'`(])\/assets\//g, `$1${base}assets/`)
        .replaceAll(String.raw`^\/assets\/`, `^${escapedBase}assets\\/`);
      if (entry.name === 'index.html' && !after.includes('rel="icon"')) {
        after = after.replace('<head>', '<head>\n<link rel="icon" href="data:,">');
      }
      if (after !== before) { await writeFile(file, after); changed++; }
    }
  }
}
await prepare(output);
await writeFile(join(output, '.nojekyll'), '');
console.log(`Prepared ${output} for ${base}; updated ${changed} compiled files.`);
