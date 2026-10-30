// Reproduce "the clip background is a still image".
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const url = pathToFileURL(join(appRoot, 'dist', 'songframe.html')).href;
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
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
  await window.songframe.loadAudioFile(new File([bytes], 'Clip Test.wav', { type: 'audio/wav' }));
}, wav);

await page.click('.tab[data-tab="style"]');
await page.waitForTimeout(200);
await page.click('#bgTools button:has-text("Browse library")');
await page.waitForSelector('#mediaModal:not([hidden])');
await page.click('#mediaTabs button[data-tab="video"]');
await page.waitForTimeout(300);
await page.fill('#mediaQuery', 'ocean waves');
await page.evaluate(() => document.querySelector('[data-act="search"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForFunction(() => document.querySelectorAll('#mediaGrid .media-tile:not(.skeleton)').length > 0, null, { timeout: 45000 });
await page.locator('#mediaGrid .media-tile:not(.skeleton)').first().click();
await page.click('#mediaModal [data-act="use"]');
await page.waitForFunction(() => window.songframe.getState().bg === 'video', null, { timeout: 60000 });

// quiet visualizer so the only movement left is the clip itself
await page.evaluate(() => {
  window.songframe.setConfig({ preset: 'Minimal', particles: 0, text: [], lyrics: { ...window.songframe.getState().lyrics, enabled: false } });
  window.songframe.drawAt(1);
});
await page.waitForTimeout(400);

const first = await page.evaluate(() => ({ ...window.songframe.getBackground(), frame: document.querySelector('#preview').toDataURL('image/png') }));
await page.waitForTimeout(1800);
const second = await page.evaluate(() => ({ ...window.songframe.getBackground(), frame: document.querySelector('#preview').toDataURL('image/png') }));

console.log(JSON.stringify({
  first: { paused: first.videoPaused, time: first.videoTime && Number(first.videoTime.toFixed(2)) },
  second: { paused: second.videoPaused, time: second.videoTime && Number(second.videoTime.toFixed(2)) },
  frameChanged: first.frame !== second.frame,
}, null, 1));

await browser.close();
