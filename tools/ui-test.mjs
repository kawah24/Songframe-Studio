// Clicks through the real interface (no test API) and checks the state reacts.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const url = pathToFileURL(join(appRoot, 'dist', 'songframe.html')).href;
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto(url);
await page.waitForFunction(() => Boolean(window.songframe?.ready));

// theme colours: pick one, check it lands and survives a reload
await page.click('#btnTheme');
check(await page.isVisible('#themePop'), 'theme menu opens');
const themeCount = await page.locator('#themeList .theme-item').count();
check(themeCount >= 4, 'themes are listed', `${themeCount}`);
await page.click('#themeList .theme-item[data-theme="brandl"]');
await page.waitForTimeout(200);
const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
check(accent.toLowerCase() === '#2fd3cb', 'theme changes the accent colour', accent);
check(await page.evaluate(() => document.querySelector('#themePop').hidden), 'menu closes after picking');
await page.reload();
await page.waitForFunction(() => Boolean(window.songframe?.ready));
const remembered = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
check(remembered.toLowerCase() === '#2fd3cb', 'theme is remembered', remembered);
await page.evaluate(() => {
  localStorage.removeItem('songframe.theme');
  document.documentElement.style.setProperty('--accent', '#ec4899');
  document.documentElement.style.setProperty('--accent-rgb', '236, 72, 153');
  document.documentElement.style.setProperty('--accent-2', '#8b5cf6');
  document.documentElement.style.setProperty('--accent-2-rgb', '139, 92, 246');
});

// a short silent-ish wav, enough to enable the editor
const wav = await page.evaluate(() => {
  const rate = 8000, frames = rate * 5;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.sin((i / rate) * 2 * Math.PI * 220) * 8000, true);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
});
await page.evaluate(async (base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await window.songframe.loadAudioFile(new File([bytes], 'UI Test.wav', { type: 'audio/wav' }));
}, wav);

const state = () => page.evaluate(() => window.songframe.getState());

// centre art defaults to the studio logo
await page.waitForTimeout(600);
const coverKind = await page.evaluate(() => window.songframe.getBackground().cover);
check(coverKind === 'logo', 'centre image starts as the logo', coverKind);
await page.click('.tab[data-tab="style"]');
await page.click('#btnCoverReset');
await page.waitForTimeout(200);
const generatedKind = await page.evaluate(() => window.songframe.getBackground().cover);
check(generatedKind === 'generated', 'generated art can be chosen', generatedKind);
await page.click('#btnCoverDefault');
await page.waitForTimeout(200);
const backToLogo = await page.evaluate(() => window.songframe.getBackground().cover);
check(backToLogo === 'logo', 'the logo can be restored', backToLogo);
await page.click('.tab[data-tab="presets"]');

// preset card
await page.click('.preset-card[data-preset="Orbital"]');
check((await state()).preset === 'Orbital', 'preset card switches the preset');

// aspect segment
await page.click('.tab[data-tab="style"]');
await page.click('#aspectSeg button[data-value="9:16"]');
check((await state()).aspect === '9:16', 'aspect segment switches the frame');
const box = await page.locator('#frame').boundingBox();
check(Boolean(box && box.height > box.width), 'stage refits for 9:16', box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '');
await page.click('#aspectSeg button[data-value="16:9"]');

// drag the visualizer on the canvas
const before = await state();
const canvas = await page.locator('#preview').boundingBox();
const cx = canvas.x + canvas.width / 2;
const cy = canvas.y + canvas.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 70, cy - 30, { steps: 8 });
await page.mouse.up();
const after = await state();
check(after.posX > before.posX + 2 && after.posY < before.posY - 1, 'dragging the canvas moves the visualizer', `${before.posX.toFixed(1)},${before.posY.toFixed(1)} -> ${after.posX.toFixed(1)},${after.posY.toFixed(1)}`);

// text layer: add, edit, drag
await page.click('.tab[data-tab="text"]');
const countBefore = (await state()).text.length;
await page.click('#btnAddText');
const countAfter = (await state()).text.length;
check(countAfter === countBefore + 1, 'add layer creates a text layer', `${countBefore} -> ${countAfter}`);
await page.fill('.text-item.is-active [data-field="text"]', 'Hello frame');
check((await state()).text.some((layer) => layer.text === 'Hello frame'), 'editing a layer updates the model');

// visualizer opacity changes the picture
await page.click('.tab[data-tab="style"]');
await page.evaluate(() => window.songframe.drawAt(1));
const opaque = await page.evaluate(() => document.querySelector('#preview').toDataURL('image/png'));
await page.evaluate(() => {
  const slider = document.querySelector('#opacity');
  slider.value = '25';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => window.songframe.drawAt(1));
const translucent = await page.evaluate(() => document.querySelector('#preview').toDataURL('image/png'));
const opacityState = (await state()).visualizerOpacity;
check(Math.abs(opacityState - 0.25) < 0.02, 'opacity slider updates the model', String(opacityState));
check(opaque !== translucent, 'opacity changes the rendered frame');

// the font list comes from the system
await page.click('.tab[data-tab="text"]');
const fontCount = await page.locator('#textList .text-item.is-active select[data-field="font"] option').count();
check(fontCount > 15, 'font list is the system list', `${fontCount} families`);
await page.selectOption('#textList .text-item.is-active select[data-field="font"]', 'Georgia');
await page.waitForTimeout(150);
const fontState = await page.evaluate(() => window.songframe.getState().text.map((layer) => layer.font));
check(fontState.includes('Georgia'), 'font choice reaches the layer', fontState.join(','));

// sensitivity and bar count
await page.evaluate(() => { window.songframe.setConfig({ preset: 'Linear Bars' }); window.songframe.drawAt(1); });
const barsBase = await page.evaluate(() => document.querySelector('#preview').toDataURL('image/png'));
await page.evaluate(() => {
  const slider = document.querySelector('#bars');
  slider.value = '24';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => window.songframe.drawAt(1));
const barsFew = await page.evaluate(() => document.querySelector('#preview').toDataURL('image/png'));
check((await state()).bars === 24, 'bar count updates the model', String((await state()).bars));
check(barsBase !== barsFew, 'bar count changes the frame');

await page.evaluate(() => {
  const slider = document.querySelector('#sensitivity');
  slider.value = '170';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => window.songframe.drawAt(1));
const hot = await page.evaluate(() => document.querySelector('#preview').toDataURL('image/png'));
check(Math.abs((await state()).sensitivity - 1.7) < 0.02, 'sensitivity updates the model', String((await state()).sensitivity));
check(hot !== barsFew, 'sensitivity changes the frame');

// opacity must reach every preset, not just the ones that leave alpha alone
const everyPreset = ['NCS Circle', 'Linear Bars', 'Dual Mirror', 'Center Wave', 'Orbital', 'Hexagon', 'Oscilloscope', 'Digital Rain', 'Shockwave', 'Minimal', 'Waveform', 'Vinyl', 'Lyrics', 'Halo'];
const deaf = [];
for (const name of everyPreset) {
  const differs = await page.evaluate((preset) => {
    const render = (opacity) => {
      window.songframe.setConfig({ preset, visualizerOpacity: opacity, particles: 0, bg: 'none', text: [], lyrics: { ...window.songframe.getState().lyrics, enabled: false } });
      window.songframe.drawAt(1.4);
      return document.querySelector('#preview').toDataURL('image/png');
    };
    const full = render(1);
    const faded = render(0.15);
    return full !== faded;
  }, name);
  if (!differs) deaf.push(name);
}
check(deaf.length === 0, 'opacity affects every preset', deaf.length ? deaf.join(', ') : 'all 13 respond');
await page.evaluate(() => window.songframe.setConfig({ visualizerOpacity: 1, particles: 50, bg: 'generated' }));

// sliders are continuous and do not rebuild the panel mid-drag
await page.click('.tab[data-tab="text"]');
await page.click('#btnAddText');
await page.waitForTimeout(150);
const nodeKept = await page.evaluate(() => {
  const before = document.querySelector('#textList select[data-field="font"]');
  window.__fontNode = before;
  const slider = document.querySelector('#textList .text-item.is-active [data-field="size"]');
  for (const value of [80, 81, 82, 83]) {
    slider.value = String(value);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return document.querySelector('#textList select[data-field="font"]') === window.__fontNode;
});
check(nodeKept, 'dragging a text slider does not rebuild the panel');
const sizes = await page.evaluate(() => window.songframe.getState().text.map((layer) => layer.size));
check(sizes.includes(83), 'text size is not quantised', sizes.join(','));

await page.evaluate(() => {
  const slider = document.querySelector('#sensitivity');
  slider.value = '137';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
check(Math.abs((await state()).sensitivity - 1.37) < 0.001, 'sensitivity moves in 1% steps');

// palette swatch
await page.click('.tab[data-tab="style"]');
await page.click('#swatches .swatch:nth-child(7)');
check((await state()).primary.toLowerCase() === '#a855f7', 'palette swatch applies colours');

// randomize
const beforeRandom = (await state()).bgSeed;
await page.click('#btnRandomize');
check((await state()).bgSeed !== beforeRandom, 'randomize changes the look');

// transport
await page.click('#btnPlay');
await page.waitForTimeout(600);
const playing = await page.evaluate(() => {
  const button = document.querySelector('#btnPlay');
  return button?.getAttribute('aria-label');
});
check(playing === 'Pause', 'play starts the transport', String(playing));
await page.click('#btnPlay');

// effect toggle
await page.click('.tab[data-tab="fx"]');
await page.click('.fx-item[data-key="vignette"] .switch');
check((await state()).effects.vignette === true, 'effect switch enables the effect');

// eject the song, then reset the whole session
check(!(await page.isDisabled('#btnNewSong')), 'eject is available once a song is loaded');
await page.click('#btnNewSong');
await page.waitForSelector('.modal.confirm');
await page.click('.confirm-card [data-value="1"]');
await page.waitForTimeout(400);
const cleared = await page.evaluate(() => ({
  duration: window.songframe.getState().duration,
  empty: !document.querySelector('#emptyState').hasAttribute('hidden'),
}));
check(cleared.duration === 0 && cleared.empty, 'eject returns to the dropzone', JSON.stringify(cleared));
check(await page.isDisabled('#btnRender'), 'render is disabled without a song');
check(await page.isDisabled('#btnNewSong'), 'eject disables itself when empty');

await page.click('.tab[data-tab="style"]');
await page.click('#btnResetAll');
await page.waitForSelector('.modal.confirm');
await page.click('.confirm-card [data-value="1"]');
await page.waitForTimeout(400);
const defaults = await page.evaluate(() => {
  const s = window.songframe.getState();
  return { preset: s.preset, text: s.text.length, primary: s.primary, aspect: s.aspect, sensitivity: s.sensitivity };
});
check(defaults.preset === 'NCS Circle' && defaults.text === 2 && defaults.primary === '#ec4899' && defaults.sensitivity === 1, 'reset all restores the defaults', JSON.stringify(defaults));

// cancelling a confirmation leaves everything alone
await page.click('#btnResetAll');
await page.waitForSelector('.modal.confirm');
await page.click('.confirm-card [data-value="0"]');
await page.waitForTimeout(200);
check((await state()).preset === 'NCS Circle', 'cancelling a reset changes nothing');

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(failures.length ? `\nFAIL (${failures.length})\n` : '\nPASS\n');
if (failures.length) process.exit(1);
