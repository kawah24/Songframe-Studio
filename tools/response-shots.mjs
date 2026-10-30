// Visual check of the new response controls.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const outDir = join(appRoot, 'tools', 'out');
const url = pathToFileURL(join(appRoot, 'dist', 'songframe.html')).href;
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));

function makeWav(seconds = 8, rate = 44100) {
  const frames = seconds * rate;
  const pcm = Buffer.alloc(44 + frames * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + frames * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(frames * 4, 40);
  const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [246.94, 311.13, 369.99]];
  let o = 44;
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const bar = Math.floor(t / 2) % chords.length;
    let v = 0;
    for (const f of chords[bar]) for (let h = 1; h <= 7; h++) v += (Math.sin(2 * Math.PI * f * h * t) * 0.16) / h;
    const kp = t % 0.5;
    v += Math.sin(2 * Math.PI * (52 + 70 * Math.exp(-kp * 22)) * kp) * Math.exp(-kp * 16) * 0.6;
    v += (Math.random() * 2 - 1) * Math.exp(-((t + 0.125) % 0.25) * 90) * 0.08;
    const s = Math.max(-1, Math.min(1, v));
    pcm.writeInt16LE(Math.round(s * 32767), o); pcm.writeInt16LE(Math.round(s * 32767), o + 2); o += 4;
  }
  return pcm.toString('base64');
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.waitForFunction(() => Boolean(window.songframe?.ready));

await page.evaluate(async (base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await window.songframe.loadAudioFile(new File([bytes], 'Night Drive.wav', { type: 'audio/wav' }));
}, makeWav());

await page.evaluate(() => {
  window.songframe.setConfig({ preset: 'Linear Bars', particles: 0, bg: 'none', primary: '#22d3ee', secondary: '#2563eb' });
  window.songframe.drawAt(2.6);
});

const shot = async (name) => {
  await page.locator('#frame').screenshot({ path: join(outDir, name) });
};

const setSlider = async (id, value) => {
  await page.evaluate(({ id, value }) => {
    const slider = document.querySelector(id);
    slider.value = String(value);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
  await page.evaluate(() => window.songframe.drawAt(2.6));
  await page.waitForTimeout(120);
};

await setSlider('#sensitivity', 100);
await setSlider('#bars', 16);
await shot('bars-16.png');
await setSlider('#bars', 64);
await shot('bars-64.png');
await setSlider('#bars', 128);
await shot('bars-128.png');

await setSlider('#bars', 64);
await setSlider('#sensitivity', 55);
await shot('sensitivity-55.png');
await setSlider('#sensitivity', 160);
await shot('sensitivity-160.png');

await page.click('.tab[data-tab="presets"]');
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, 'ui-presets-controls.png') });

await browser.close();
console.log('shots written');
