// Bundles src/main.ts and inlines it, together with the stylesheet, into one
// self-contained dist/songframe.html that runs from file:// with no network.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'dist');
const outFile = join(outDir, 'songframe.html');

const result = await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  write: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  // The default logo travels inside the bundle as a data URL.
  loader: { '.webp': 'dataurl', '.png': 'dataurl' },
});

const js = result.outputFiles[0].text;
const css = await readFile(join(root, 'src/styles.css'), 'utf8');
const shell = await readFile(join(root, 'src/index.html'), 'utf8');

const html = shell
  .replace('<!--STYLES-->', () => `<style>\n${css}\n</style>`)
  .replace('<!--APP-->', () => `<script>\n${js}\n</script>`);

await mkdir(outDir, { recursive: true });
await writeFile(outFile, html, 'utf8');

const { size } = await stat(outFile);

// A self-contained file must not pull anything at runtime. Comments may still
// mention a URL (mp4-muxer cites a StackOverflow answer), so look for real
// references rather than the substring "http".
const externalChecks = [
  ['script src', /<script[^>]+src\s*=/i],
  ['link href', /<link[^>]+href\s*=/i],
  ['css @import', /@import\s+(url|['"])/i],
  ['css url(http)', /url\(\s*['"]?https?:/i],
  ['remote fetch', /fetch\(\s*['"]https?:/i],
];
const found = externalChecks.filter(([, pattern]) => pattern.test(html)).map(([label]) => label);

console.log(`built ${outFile}`);
console.log(`  size      ${(size / 1024).toFixed(1)} KB`);
console.log(`  script    ${(js.length / 1024).toFixed(1)} KB`);
console.log(`  style     ${(css.length / 1024).toFixed(1)} KB`);
console.log(`  external  ${found.length ? `FOUND (${found.join(', ')})` : 'none'}`);
if (found.length) process.exitCode = 1;
