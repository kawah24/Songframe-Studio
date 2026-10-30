// Video half of the background library: search clips, apply one, export a slice.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(url);
await page.waitForFunction(() => Boolean(window.songframe?.ready));

const wav = await page.evaluate(() => {
  const rate = 8000, frames = rate * 3;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.sin((i / rate) * 2 * Math.PI * 200) * 6000, true);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
});
await page.evaluate(async (base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await window.songframe.loadAudioFile(new File([bytes], 'Night Drive.wav', { type: 'audio/wav' }));
}, wav);

await page.click('.tab[data-tab="style"]');
await page.waitForTimeout(200);
await page.click('#bgTools button:has-text("Browse library")');
await page.waitForSelector('#mediaModal:not([hidden])');
await page.click('#mediaTabs button[data-tab="video"]');
await page.waitForTimeout(400);

await page.fill('#mediaQuery', 'ocean waves');
await page.evaluate(() => document.querySelector('[data-act="search"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForFunction(() => document.querySelectorAll('#mediaGrid .media-tile:not(.skeleton)').length > 0, null, { timeout: 45000 }).catch(() => undefined);
const tiles = await page.locator('#mediaGrid .media-tile:not(.skeleton)').count();
check(tiles >= 3, 'Commons video search returns clips', `${tiles} tiles`);

await page.waitForFunction(() => {
  const images = [...document.querySelectorAll('#mediaGrid img')];
  return images.length > 0 && images.slice(0, 4).every((image) => image.complete);
}, null, { timeout: 30000 }).catch(() => undefined);
await page.screenshot({ path: join(outDir, 'ui-library-videos.png') });

await page.locator('#mediaGrid .media-tile:not(.skeleton)').first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: join(outDir, 'ui-library-selected.png') });
await page.click('#mediaModal [data-act="use"]');

await page.waitForFunction(() => window.songframe.getState().bg === 'video', null, { timeout: 60000 }).catch(() => undefined);
const state = await page.evaluate(() => window.songframe.getState());
check(state.bg === 'video', 'clip becomes the background', state.bg);
check(Boolean(state.credit && state.credit.length > 3), 'clip credit recorded', state.credit);

const exported = await page.evaluate(async () => {
  window.songframe.drawAt(0.4);
  const blob = await window.songframe.exportVideo({ maxSeconds: 1.4, height: 480, fps: 24 });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { type: blob.type, bytes: blob.size, base64 };
});
check(exported.type === 'video/mp4' && exported.bytes > 10_000, 'clip background exports', `${(exported.bytes / 1024).toFixed(0)} KB`);

// two frames a second apart must differ, otherwise the clip was exported as a still
const movie = join(outDir, 'video-background.mp4');
await writeFile(movie, Buffer.from(exported.base64, 'base64'));
const grab = (time, name) => {
  const frame = join(outDir, name);
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(time), '-i', movie, '-frames:v', '1', frame]);
  return frame;
};
const f0 = grab(0.1, 'clip-frame-a.png');
const f1 = grab(1.1, 'clip-frame-b.png');
const digest = (file) => {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  return createHash('sha1').update(result.stdout ?? Buffer.alloc(0)).digest('hex');
};
check(digest(f0) !== digest(f1), 'the exported clip actually moves', 'frames 0.1s and 1.1s differ');

await page.locator('#frame').screenshot({ path: join(outDir, 'ui-video-background.png') });
check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(failures.length ? `\nFAIL (${failures.length})\n` : '\nPASS\n');
if (failures.length) process.exit(1);
