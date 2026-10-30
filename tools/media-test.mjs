// Exercises the background library: search, pick a photo, export with it, then
// switch to a pattern. Needs a network connection for the Commons half.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const outDir = join(appRoot, 'tools', 'out');
const url = pathToFileURL(join(appRoot, 'dist', 'songframe.html')).href;

const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// Commons can be slow when several suites run back to back.
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  const where = message.location()?.url ?? '';
  // The bad-key probe below is meant to be refused by Pixabay.
  if (/pixabay\.com/i.test(`${text} ${where}`) && /400/.test(text)) return;
  errors.push(text);
});

await page.goto(url);
await page.waitForFunction(() => Boolean(window.songframe?.ready));

// small wav so the studio leaves its empty state
const wav = await page.evaluate(() => {
  const rate = 8000, frames = rate * 4;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.sin((i / rate) * 2 * Math.PI * 200) * 7000, true);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
});
await page.evaluate(async (base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await window.songframe.loadAudioFile(new File([bytes], 'Rain Signal.wav', { type: 'audio/wav' }));
}, wav);

await page.click('.tab[data-tab="style"]');
await page.waitForTimeout(250);
await page.click('#bgTools button:has-text("Browse library")');
await page.waitForSelector('#mediaModal:not([hidden])');
check(await page.isVisible('#mediaModal'), 'library opens');

// provider switch: Commons needs no key, Pixabay asks for one
const providers = await page.locator('#mediaProvider button').count();
check(providers === 2, 'two providers offered', `${providers}`);
await page.click('#mediaProvider button:has-text("Pixabay")');
await page.waitForSelector('#pixabayKeyInput', { timeout: 5000 });
check(await page.isVisible('#pixabayKeyInput'), 'Pixabay asks for a key');
await page.screenshot({ path: join(outDir, 'ui-library-key.png') });
await page.fill('#pixabayKeyInput', '0000-not-a-real-key');
await page.click('[data-act="save-key"]');
await page.waitForFunction(() => Boolean(document.querySelector('.media-key-problem')), null, { timeout: 25000 }).catch(() => undefined);
const refused = await page.locator('.media-key-problem').textContent().catch(() => '');
check(/refused|key/i.test(refused || ''), 'a bad key is reported clearly', (refused || '').slice(0, 48));
await page.click('#mediaProvider button:has-text("Commons")');
await page.waitForTimeout(400);

// photos arrive from Commons
await page.waitForFunction(() => document.querySelectorAll('#mediaGrid .media-tile:not(.skeleton)').length > 0, null, { timeout: 30000 }).catch(() => undefined);
const tiles = await page.locator('#mediaGrid .media-tile:not(.skeleton)').count();
check(tiles >= 6, 'Commons search returns pictures', `${tiles} tiles`);
check(await page.locator('#mediaChips .chip-btn').count() >= 2, 'track suggestions render');

// the grid is showing real thumbnails
const firstThumb = await page.locator('#mediaGrid .media-tile img').first().evaluate((node) => node.getAttribute('src') || '');
check(firstThumb.includes('http'), 'tile has a thumbnail', firstThumb.slice(0, 60));

await page.waitForFunction(() => {
  const images = [...document.querySelectorAll('#mediaGrid img')];
  return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
}, null, { timeout: 45000 }).catch(() => undefined);
console.log('  loaded images: ' + await page.evaluate(() => [...document.querySelectorAll('#mediaGrid img')].filter((i) => i.naturalWidth > 0).length));
await page.screenshot({ path: join(outDir, 'ui-library.png') });

await page.locator('#mediaGrid .media-tile:not(.skeleton)').first().click();
await page.waitForTimeout(200);
check(!(await page.locator('#mediaModal [data-act="use"]').isDisabled()), 'selecting enables Use');
await page.click('#mediaModal [data-act="use"]');
await page.waitForTimeout(2500);

const afterPhoto = await page.evaluate(() => window.songframe.getState());
check(afterPhoto.bg === 'image', 'background became an image', afterPhoto.bg);
check(Boolean(afterPhoto.credit && afterPhoto.credit.length > 3), 'credit recorded', afterPhoto.credit);

// the picture is drawable and does not taint the canvas: a 1 s export proves it
const photoExport = await page.evaluate(async () => {
  window.songframe.drawAt(1);
  const blob = await window.songframe.exportVideo({ maxSeconds: 1, height: 480, fps: 24 });
  return { type: blob.type, bytes: blob.size };
});
check(photoExport.type === 'video/mp4' && photoExport.bytes > 20_000, 'photo background exports', `${(photoExport.bytes / 1024).toFixed(0)} KB`);

// centre image from the same library
await page.click('#btnCoverLibrary');
await page.waitForSelector('#mediaModal:not([hidden])');
const heading = await page.locator('#mediaTitle').textContent();
check(/centre/i.test(heading || ''), 'library opens for the centre image', heading || '');
const centreTabs = await page.locator('#mediaTabs button').count();
check(centreTabs === 1, 'centre image offers photos only', `${centreTabs} tab`);
await page.waitForFunction(() => document.querySelectorAll('#mediaGrid .media-tile:not(.skeleton)').length > 0, null, { timeout: 30000 }).catch(() => undefined);
await page.locator('#mediaGrid .media-tile:not(.skeleton)').first().click();
await page.click('#mediaModal [data-act="use"]');
await page.waitForTimeout(2500);
const centre = await page.evaluate(() => window.songframe.getBackground());
check(centre.hasCentreImage === true, 'centre image comes from the library');
const centreCredit = (await page.locator('#coverCredit').textContent()) || '';
check(centreCredit.trim().length > 3, 'centre credit is shown in the panel', centreCredit.trim().slice(0, 44));
await page.screenshot({ path: join(outDir, 'ui-style-centre.png') });

// patterns work offline
await page.click('#bgTools button:has-text("Browse library")');
await page.waitForSelector('#mediaModal:not([hidden])');
await page.click('#mediaTabs button[data-tab="pattern"]');
await page.waitForTimeout(400);
const patternTiles = await page.locator('#mediaGrid .pattern-tile').count();
check(patternTiles === 12, 'pattern library has 12 designs', `${patternTiles}`);
await page.screenshot({ path: join(outDir, 'ui-patterns.png') });
await page.locator('#mediaGrid .pattern-tile').nth(4).click();
await page.waitForTimeout(400);
const afterPattern = await page.evaluate(() => window.songframe.getState());
check(afterPattern.bg === 'pattern' && afterPattern.pattern === 4, 'pattern applies', `${afterPattern.bg}/${afterPattern.pattern}`);

await page.evaluate(() => window.songframe.drawAt(1.4));
await page.waitForTimeout(200);
await page.locator('#frame').screenshot({ path: join(outDir, 'ui-pattern-waves.png') });

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await writeFile(join(outDir, 'media-console.txt'), errors.join('\n') || 'no console errors');
await browser.close();
console.log(failures.length ? `\nFAIL (${failures.length})\n` : '\nPASS\n');
if (failures.length) process.exit(1);
