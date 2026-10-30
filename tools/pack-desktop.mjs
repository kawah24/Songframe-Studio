// Copies the built single-file UI into the desktop package.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]tools$/, '');
const from = join(root, 'dist', 'songframe.html');
const to = join(root, 'desktop', 'ui', 'songframe.html');

await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);
const { size } = await stat(to);
console.log(`desktop/ui/songframe.html  ${(size / 1024).toFixed(1)} KB`);
