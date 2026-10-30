// UI capture pass: every tab, the empty state and the render dialog.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const outDir = join(appRoot, 'tools', 'out');
const url = pathToFileURL(join(appRoot, 'dist', 'songframe.html')).href;

const executablePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => existsSync(p));

await mkdir(outDir, { recursive: true });

/** A short musical clip: saw-ish chords, kick, snare and hats. */
function makeWav(seconds = 8, rate = 44100) {
  const frames = seconds * rate;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const chords = [
    [220, 277.18, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [246.94, 311.13, 369.99],
  ];
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const bar = Math.floor(t / 2) % chords.length;
    let value = 0;
    for (const freq of chords[bar]) {
      for (let h = 1; h <= 7; h++) value += (Math.sin(2 * Math.PI * freq * h * t) * 0.16) / h;
    }
    const kickPhase = t % 0.5;
    const kick = Math.sin(2 * Math.PI * (52 + 70 * Math.exp(-kickPhase * 22)) * kickPhase) * Math.exp(-kickPhase * 16) * 0.6;
    const snarePhase = (t + 0.25) % 1;
    const snare = (Math.random() * 2 - 1) * Math.exp(-snarePhase * 26) * 0.16;
    const hatPhase = (t + 0.125) % 0.25;
    const hat = (Math.random() * 2 - 1) * Math.exp(-hatPhase * 95) * 0.08;
    const sample = Math.max(-1, Math.min(1, value + kick + snare + hat));
    left[i] = sample;
    right[i] = sample * 0.94 + Math.sin(2 * Math.PI * 330 * t) * 0.02;
  }
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(Math.round(left[i] * 32767), offset);
    buffer.writeInt16LE(Math.round(right[i] * 32767), offset + 2);
    offset += 4;
  }
  return buffer.toString('base64');
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(url);
await page.waitForFunction(() => Boolean(window.songframe?.ready));
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, 'ui-empty.png') });

const wav = makeWav(8);
await page.evaluate(async (base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await window.songframe.loadAudioFile(new File([bytes], 'Midnight Drive.wav', { type: 'audio/wav' }));
}, wav);

const lrc = `[00:00.00]Midnight drive, the city hums
[00:02.00]<00:02.00>Neon <00:02.45>bleeding <00:02.90>through <00:03.35>the glass
[00:04.10]Every window, every passing car
[00:06.00][Chorus] We are still awake`;
await page.evaluate((text) => window.songframe.loadLyrics(text), lrc);
await page.evaluate(() => {
  window.songframe.setConfig({ preset: 'NCS Circle', primary: '#ec4899', secondary: '#8b5cf6', particles: 60 });
  window.songframe.drawAt(2.6);
});
await page.waitForTimeout(200);
await page.screenshot({ path: join(outDir, 'ui-app.png') });

const tab = async (name) => {
  await page.click(`.tab[data-tab="${name}"]`);
  await page.waitForTimeout(260);
};

await tab('style');
await page.screenshot({ path: join(outDir, 'ui-style.png') });

await tab('text');
await page.click('#lyricsToggle');
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, 'ui-text.png') });

await tab('fx');
await page.evaluate(() => {
  document.querySelectorAll('.fx-item .switch')[3]?.click();
  window.songframe.drawAt(2.6);
});
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, 'ui-fx-cctv.png') });
await page.evaluate(() => {
  document.querySelectorAll('.fx-item .switch').forEach((node, index) => {
    if ([1, 6, 9].includes(index)) node.click();
  });
  window.songframe.drawAt(1.2);
});
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, 'ui-fx.png') });

// render dialog, captured while it runs through the real button
await page.evaluate(() => {
  window.songframe.setConfig({ preset: 'NCS Circle', aspect: '16:9', height: 720 });
  document.querySelector('.tab[data-tab="presets"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.click('#btnRender');
await page.waitForTimeout(900);
const modal = page.locator('#renderModal');
if (await modal.isVisible()) {
  await page.screenshot({ path: join(outDir, 'ui-render.png') });
  console.log('captured render dialog');
} else {
  console.log('warn: render dialog not visible');
}
await page.waitForTimeout(1500);
if (await modal.isVisible()) await page.screenshot({ path: join(outDir, 'ui-render-done.png') });
await page.waitForTimeout(500);

await writeFile(join(outDir, 'ui-console.txt'), errors.join('\n') || 'no console errors');
console.log(`console errors: ${errors.length}`);
await browser.close();
