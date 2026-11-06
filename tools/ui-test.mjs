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

// lyrics have their own font, and their own reset
await page.evaluate(() => window.songframe.loadLyrics('[00:00.00]One line\n[00:01.00]Two lines'));
await page.click('#lyricsToggle');
await page.waitForTimeout(250);
const lyricFontCount = await page.locator('#lyricFont option').count();
check(lyricFontCount > 15, 'lyrics have a font menu', `${lyricFontCount}`);
await page.selectOption('#lyricFont', 'Georgia');
check((await state()).lyrics.font === 'Georgia', 'lyric font updates the model');
await page.evaluate(() => {
  const slider = document.querySelector('#lyricSize');
  slider.value = '70';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.click('#btnLyricsReset');
await page.waitForTimeout(250);
const lyricsState = (await state()).lyrics;
check(
  lyricsState.font === 'Segoe UI' && lyricsState.size === 46 && lyricsState.pos === 'bottom',
  'lyrics reset to defaults',
  JSON.stringify({ font: lyricsState.font, size: lyricsState.size, pos: lyricsState.pos }),
);
check(lyricsState.enabled === true, 'the reset keeps the loaded lyrics');

// a line that cannot fit must wrap instead of running off the frame
const lyricFit = await page.evaluate(() => {
  window.songframe.setConfig({
    preset: 'Minimal',
    aspect: '9:16',
    bg: 'none',
    text: [],
    lyrics: { ...window.songframe.getState().lyrics, enabled: true, size: 96 },
  });
  window.songframe.loadLyrics("[00:00.00]'s Uhr bleibt stehn, d'Zeit geht langsam");
  window.songframe.drawAt(1.4);
  const canvas = document.querySelector('#preview');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let edge = 0;
  let lit = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const sum = data[i] + data[i + 1] + data[i + 2];
      if (sum > 420) {
        lit += 1;
        if (x < 3 || x > canvas.width - 4) edge += 1;
      }
    }
  }
  return { edge, lit, width: canvas.width };
});
check(lyricFit.lit > 50, 'the long lyric line is drawn', `${lyricFit.lit} lit pixels`);
check(lyricFit.edge === 0, 'a long lyric line never reaches the frame edge', `${lyricFit.edge} edge pixels at ${lyricFit.width}px`);
await page.evaluate(() => {
  window.songframe.setConfig({ preset: 'NCS Circle', aspect: '16:9', bg: 'generated', text: [], lyrics: { ...window.songframe.getState().lyrics, enabled: false, size: 46 } });
});

await page.click('#btnLyricsClear');
await page.waitForTimeout(250);
const lyricsCleared = await page.evaluate(() => ({
  lines: window.songframe.getLyrics().length,
  enabled: window.songframe.getState().lyrics.enabled,
  area: document.querySelector('#lyricText').value,
  status: document.querySelector('#lyricStatus').textContent,
}));
check(
  lyricsCleared.lines === 0 &&
    lyricsCleared.enabled === false &&
    lyricsCleared.area === '' &&
    lyricsCleared.status === 'No lyrics loaded',
  'remove lyrics clears the lines, the text and the toggle',
  JSON.stringify(lyricsCleared),
);

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
const everyPreset = ['NCS Circle', 'Linear Bars', 'Dual Mirror', 'Center Wave', 'Orbital', 'Hexagon', 'Oscilloscope', 'Digital Rain', 'Shockwave', 'Waveform', 'Vinyl', 'Lyrics', 'Halo'];
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
check(deaf.length === 0, 'opacity affects every preset', deaf.length ? deaf.join(', ') : `${everyPreset.length} respond`);
await page.evaluate(() => window.songframe.setConfig({ visualizerOpacity: 1, particles: 50, bg: 'generated' }));

// the halo ring keeps its own spectrum, whatever the palette says
const haloHues = await page.evaluate(() => {
  window.songframe.setConfig({ preset: 'Halo', particles: 0, primary: '#ec4899', secondary: '#22d3ee' });
  window.songframe.drawAt(1.5);
  const canvas = document.querySelector('#preview');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const bands = new Set();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 0.18 || (max + min) / 2 < 0.25) continue;
    let hue = 0;
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / delta + 2) * 60;
    else hue = ((r - g) / delta + 4) * 60;
    bands.add(Math.floor(hue / 30));
  }
  return [...bands].sort((a, b) => a - b);
});
check(haloHues.length >= 6, 'halo keeps a full spectrum', `${haloHues.length} hue bands: ${haloHues.join(',')}`);
await page.evaluate(() => window.songframe.setConfig({ preset: 'NCS Circle', primary: '#ec4899', secondary: '#22d3ee' }));

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
check(await page.locator('.fx-item[data-key="zoom"]').count() === 1, 'kick zoom is listed');
check(await page.locator('.fx-item[data-key="kaleidoscope"]').count() === 1, 'kaleidoscope is listed');
check(await page.locator('.fx-item[data-key="leak"]').count() === 1, 'light leak is listed');

// the three new effects change the frame, and their intensity matters
const newFx = await page.evaluate(() => {
  const keys = ['shake', 'glitch', 'vhs', 'cctv', 'scanlines', 'chromatic', 'bloom', 'grain', 'pixelate', 'strobe', 'vignette', 'hue', 'letterbox', 'zoom', 'kaleidoscope', 'leak'];
  const render = (fx, amount) => {
    const effects = {};
    for (const key of keys) effects[key] = false;
    if (fx) effects[fx] = true;
    window.songframe.setConfig({ preset: 'Linear Bars', bg: 'generated', particles: 0, text: [], effects, amounts: { ...window.songframe.getState().amounts, ...(fx ? { [fx]: amount } : {}) } });
    window.songframe.drawAt(1.5);
    return document.querySelector('#preview').toDataURL('image/png');
  };
  const off = render(null, 0);
  return {
    zoom: render('zoom', 1) !== off,
    kaleidoscope: render('kaleidoscope', 0.8) !== off,
    leak: render('leak', 1) !== off,
    zoomAmount: render('zoom', 0.15) !== render('zoom', 1),
  };
});
check(
  newFx.zoom && newFx.kaleidoscope && newFx.leak,
  'kick zoom, kaleidoscope and light leak all render',
  JSON.stringify(newFx),
);
check(newFx.zoomAmount, 'kick zoom intensity changes the punch');

// the background drift is rate-controlled, and the rate must reach the picture
const drift = await page.evaluate(() => {
  const { duration: _duration, ...before } = window.songframe.getState();
  const render = (speed, t) => {
    window.songframe.setConfig({ ...before, preset: 'Minimal', bg: 'generated', particles: 0, text: [], zoomSpeed: speed });
    window.songframe.drawAt(t);
    return document.querySelector('#preview').toDataURL('image/png');
  };
  const same = render(1, 2);
  const result = {
    deterministic: same === render(1, 2),
    speedMatters: same !== render(4, 2),
    frozenDiffers: same !== render(0, 2),
  };
  window.songframe.setConfig(before);
  return result;
});
check(drift.deterministic, 'a fixed time renders the same frame', JSON.stringify(drift));
check(drift.speedMatters, 'zoom speed changes the background drift');
check(drift.frozenDiffers, 'zoom speed 0 freezes the drift');

check(await page.locator('#zoomSpeed').count() === 1, 'zoom speed slider is listed');
const driftLabels = await page.evaluate(() => {
  const el = document.querySelector('#zoomSpeed');
  const out = document.querySelector('#zoomSpeedOut');
  const read = (v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return out.textContent;
  };
  const labels = [read(0), read(100), read(400)];
  read(100);
  return labels;
});
check(
  driftLabels[0] === 'Off' && driftLabels[1] === '1x' && driftLabels[2] === '4x',
  'zoom speed reads Off / 1x / 4x',
  driftLabels.join(' '),
);

// watermark: size, opacity and corner, and they must reach the config
check(await page.locator('#waterScale').count() === 1, 'watermark size slider is listed');
const water = await page.evaluate(() => {
  const set = (sel, v, evt = 'input') => {
    const el = document.querySelector(sel);
    el.value = String(v);
    el.dispatchEvent(new Event(evt, { bubbles: true }));
  };
  set('#waterScale', 20);
  set('#waterOpacity', 40);
  const corner = document.querySelector('#waterCorner');
  corner.value = 'tl';
  corner.dispatchEvent(new Event('change', { bubbles: true }));
  const s = window.songframe.getState();
  const out = { scale: s.watermarkScale, opacity: s.watermarkOpacity, corner: s.watermarkCorner };
  set('#waterScale', 12);
  set('#waterOpacity', 75);
  corner.value = 'br';
  corner.dispatchEvent(new Event('change', { bubbles: true }));
  return out;
});
check(
  Math.abs(water.scale - 0.2) < 1e-6 && Math.abs(water.opacity - 0.4) < 1e-6 && water.corner === 'tl',
  'watermark size, opacity and corner reach the config',
  JSON.stringify(water),
);

const qualityOut = (await page.textContent('#qualityOut')) ?? '';
check(qualityOut.includes('%'), 'video quality reads as a percentage', qualityOut);
const estimate = (await page.textContent('#qualitySize')) ?? '';
check(estimate.includes('MB') || estimate.includes('GB'), 'file size estimate is shown once a song is loaded', estimate);

// a sound cue is not a lyric line
const cueStatus = await page.evaluate(() => {
  const area = document.querySelector('#lyricText');
  const before = area.value;
  area.value = '[Music]\nHello there, this is a line of words';
  document.querySelector('#btnDistribute').click();
  const status = document.querySelector('#lyricStatus').textContent ?? '';
  area.value = before;
  document.querySelector('#btnDistribute').click();
  return status;
});
check(cueStatus.includes('1 lyric lines'), 'a [Music] cue is dropped from the lyrics', cueStatus);

// long cues are cut into ~8-word lines instead of being shrunk or clipped
const splitStatus = await page.evaluate(() => {
  const area = document.querySelector('#lyricText');
  const before = area.value;
  area.value = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen';
  document.querySelector('#btnDistribute').click();
  const status = document.querySelector('#lyricStatus').textContent ?? '';
  area.value = before;
  document.querySelector('#btnDistribute').click();
  return status;
});
check(splitStatus.includes('3 lyric lines'), 'long cues are split into ~8-word lines', splitStatus);

// type is composed above the effect stack, so effects must not move or scale it
const typeUnderFx = await page.evaluate(() => {
  const keys = ['shake', 'glitch', 'vhs', 'cctv', 'scanlines', 'chromatic', 'bloom', 'grain', 'pixelate', 'strobe', 'vignette', 'hue', 'letterbox', 'zoom', 'kaleidoscope', 'leak'];
  const box = (withFx) => {
    const effects = {};
    for (const key of keys) effects[key] = false;
    if (withFx) {
      effects.kaleidoscope = true;
      effects.zoom = true;
      effects.pixelate = true;
      effects.hue = true;
    }
    window.songframe.setConfig({
      preset: 'Linear Bars',
      bg: 'solid',
      particles: 0,
      effects,
      amounts: { ...window.songframe.getState().amounts, kaleidoscope: 0.9, zoom: 1, pixelate: 1, hue: 1 },
      text: [{ id: 'title', text: 'NEON TITLE', x: 50, y: 40, size: 72, color: '#ffffff', font: 'Segoe UI', bold: true, opacity: 1, align: 'center' }],
      lyrics: { ...window.songframe.getState().lyrics, enabled: false },
    });
    window.songframe.drawAt(1.5);
    const canvas = document.querySelector('#preview');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = 1e9;
    let minY = 1e9;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return [minX, minY, maxX, maxY];
  };
  return { off: box(false), on: box(true) };
});
const within = (a, b) => a.every((value, index) => Math.abs(value - b[index]) <= 2);
check(within(typeUnderFx.off, typeUnderFx.on), 'text is not touched by the effect stack', JSON.stringify(typeUnderFx));

// glow is optional and independent for text and lyrics
const glowProbe = await page.evaluate(() => {
  const shot = (glow, withText) => {
    window.songframe.setConfig({
      preset: 'Minimal',
      bg: 'solid',
      particles: 0,
      text: withText
        ? [{ id: 'title', text: 'GLOW', x: 50, y: 40, size: 80, color: '#ffffff', font: 'Segoe UI', bold: true, opacity: 1, align: 'center', glow }]
        : [],
      lyrics: { ...window.songframe.getState().lyrics, enabled: !withText, glow, size: 54 },
    });
    window.songframe.loadLyrics('[00:00.00]glow test line');
    window.songframe.drawAt(1.2);
    return document.querySelector('#preview').toDataURL('image/png');
  };
  return { textOff: shot(0, true), textOn: shot(0.9, true), lyricOff: shot(0, false), lyricOn: shot(0.9, false) };
});
check(glowProbe.textOff !== glowProbe.textOn, 'text glow changes the frame');

// shake must respond to intensity even when the bass never goes high
const shakeRange = await page.evaluate(() => {
  let quiet = null;
  for (let t = 0.2; t < 3; t += 0.1) {
    const frame = window.songframe.getFrame(t);
    if (frame && frame.bass < 0.35) {
      quiet = Number(t.toFixed(2));
      break;
    }
  }
  if (quiet === null) return { quiet: null, centre: 0, outside: 0 };
  const canvas = document.querySelector('#preview');
  const ctx = canvas.getContext('2d');
  const shot = (amount) => {
    window.songframe.setConfig({
      preset: 'NCS Circle',
      bg: 'solid',
      particles: 0,
      text: [],
      effects: { ...window.songframe.getState().effects, shake: true },
      amounts: { ...window.songframe.getState().amounts, shake: amount },
      lyrics: { ...window.songframe.getState().lyrics, enabled: false },
    });
    window.songframe.drawAt(quiet);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };
  const low = shot(0.15).data;
  const high = shot(1).data;
  const w = canvas.width;
  const h = canvas.height;
  let centre = 0;
  let corner = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const changed = Math.abs(low[i] - high[i]) + Math.abs(low[i + 1] - high[i + 1]) + Math.abs(low[i + 2] - high[i + 2]) > 12;
      if (!changed) continue;
      if (Math.abs(x / w - 0.5) < 0.2 && Math.abs(y / h - 0.5) < 0.26) centre += 1;
      // far away from the disc: the background must not join in
      if (x / w < 0.2 && y / h < 0.2) corner += 1;
    }
  }
  return { quiet, centre, corner };
});
check(shakeRange.centre > 200, 'shake intensity moves the centre art', JSON.stringify(shakeRange));
check(shakeRange.corner === 0, 'shake leaves the background alone', JSON.stringify(shakeRange));

// a glow has to be bright enough to actually read as light
const glowBrightness = await page.evaluate(() => {
  const canvas = document.querySelector('#preview');
  const ctx = canvas.getContext('2d');
  const band = () => {
    const y0 = Math.floor(canvas.height * 0.62);
    const data = ctx.getImageData(0, y0, canvas.width, canvas.height - y0).data;
    let lit = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v > 40) lit += 1;
      if (v > peak) peak = v;
    }
    return { lit, peak: Math.round(peak) };
  };
  const shot = (glow) => {
    window.songframe.setConfig({
      preset: 'Minimal',
      bg: 'solid',
      particles: 0,
      text: [],
      lyrics: {
        ...window.songframe.getState().lyrics,
        enabled: true,
        style: 'lines',
        color: '#ffffff',
        highlight: '#ec4899',
        pillOpacity: 0,
        glow,
      },
    });
    window.songframe.drawAt(1.2);
    return band();
  };
  return { off: shot(0), on: shot(1) };
});
check(
  glowBrightness.on.lit > glowBrightness.off.lit * 2 && glowBrightness.on.peak > 150,
  'lyric glow is bright enough to see',
  JSON.stringify(glowBrightness),
);

// lyrics need a bold on/off switch, and off has to actually be lighter
const boldToggle = await page.evaluate(() => {
  const box = document.querySelector('#lyricBold');
  const canvas = document.querySelector('#preview');
  const ctx = canvas.getContext('2d');
  const shot = (bold) => {
    window.songframe.setConfig({
      preset: 'Minimal',
      bg: 'solid',
      particles: 0,
      text: [],
      lyrics: {
        ...window.songframe.getState().lyrics,
        enabled: true,
        style: 'lines',
        color: '#ffffff',
        highlight: '#ec4899',
        pillOpacity: 0,
        glow: 0,
        bold,
      },
    });
    window.songframe.drawAt(1.2);
    const y0 = Math.floor(canvas.height * 0.6);
    const data = ctx.getImageData(0, y0, canvas.width, canvas.height - y0).data;
    let lit = 0;
    let minX = canvas.width;
    let maxX = 0;
    for (let y = 0; y < canvas.height - y0; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 120) {
          lit += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    return { lit, width: maxX - minX };
  };
  return { exists: Boolean(box), checked: box ? box.checked : null, on: shot(true), off: shot(false) };
});
check(
  boldToggle.exists &&
    boldToggle.checked === true &&
    boldToggle.on.width > boldToggle.off.width * 1.03 &&
    boldToggle.off.lit < boldToggle.on.lit,
  'lyrics have a bold switch that lightens the type',
  JSON.stringify(boldToggle),
);

// "Clean" must really be clean: no wave line, no progress bar
const cleanPreset = await page.evaluate(() => {
  const canvas = document.querySelector('#preview');
  const ctx = canvas.getContext('2d');
  const shot = (particles) => {
    window.songframe.setConfig({
      preset: 'Minimal',
      bg: 'solid',
      particles,
      text: [],
      lyrics: { ...window.songframe.getState().lyrics, enabled: false },
      effects: {},
    });
    window.songframe.drawAt(4);
    const { width: w, height: h } = canvas;
    const data = ctx.getImageData(0, 0, w, h).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) {
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return seen.size;
  };
  return { off: shot(0), on: shot(60) };
});
check(cleanPreset.off === 1, 'clean preset draws nothing but the backdrop', JSON.stringify(cleanPreset));
check(cleanPreset.on > 20, 'clean preset still draws particles', JSON.stringify(cleanPreset));

// lyric text opacity must actually fade the letters
const lyricOpacity = await page.evaluate(() => {
  const slider = document.querySelector('#lyricOpacity');
  const out = document.querySelector('#lyricOpacityOut');
  const canvas = document.querySelector('#preview');
  const ctx = canvas.getContext('2d');
  const shot = (opacity) => {
    window.songframe.setConfig({
      preset: 'Minimal',
      bg: 'solid',
      particles: 0,
      text: [],
      effects: {},
      lyrics: {
        ...window.songframe.getState().lyrics,
        enabled: true,
        style: 'lines',
        color: '#ffffff',
        highlight: '#ec4899',
        pillOpacity: 0,
        glow: 0,
        size: 64,
        opacity,
      },
    });
    window.songframe.drawAt(4);
    const { width: w, height: h } = canvas;
    const data = ctx.getImageData(0, 0, w, h).data;
    let lit = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      if (v > 60) lit += 1;
      if (v > peak) peak = v;
    }
    return { lit, peak };
  };
  const full = shot(1);
  const faded = shot(0.35);
  const gone = shot(0);
  if (slider) {
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const wired = { value: window.songframe.getState().lyrics.opacity, label: out ? out.textContent : null };
  if (slider) {
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { slider: Boolean(slider), full, faded, gone, wired };
});
check(
  lyricOpacity.slider && lyricOpacity.wired.value === 0.4 && lyricOpacity.wired.label === '40%',
  'lyrics have a text opacity slider',
  JSON.stringify(lyricOpacity.wired),
);
check(
  lyricOpacity.full.peak > 200 && lyricOpacity.faded.peak < 140 && lyricOpacity.gone.lit === 0,
  'lyric text opacity fades the type',
  JSON.stringify({ full: lyricOpacity.full, faded: lyricOpacity.faded, gone: lyricOpacity.gone }),
);

// the 90 / 85 / 80 stops the folk-and-country guidelines ask for must be one click away
const opacityStops = await page.evaluate(() => {
  const slider = document.querySelector('#lyricOpacity');
  const out = document.querySelector('#lyricOpacityOut');
  const buttons = [...document.querySelectorAll('#lyricOpacityQuick button')];
  const click = (label) => {
    const button = buttons.find((node) => node.textContent.trim() === label);
    if (!button) return null;
    button.click();
    return {
      value: slider ? slider.value : null,
      out: out ? out.textContent : null,
      config: window.songframe.getState().lyrics.opacity,
      active: button.classList.contains('is-active'),
    };
  };
  const stops = {
    labels: buttons.map((node) => node.textContent.trim()),
    p90: click('90%'),
    p85: click('85%'),
    p80: click('80%'),
  };
  click('100%');
  return stops;
});
check(
  opacityStops.p90 &&
    opacityStops.p85 &&
    opacityStops.p80 &&
    opacityStops.p90.config === 0.9 &&
    opacityStops.p85.config === 0.85 &&
    opacityStops.p80.config === 0.8 &&
    opacityStops.p85.value === '85' &&
    opacityStops.p85.out === '85%' &&
    opacityStops.p85.active,
  'text opacity offers 90, 85 and 80 percent stops',
  JSON.stringify(opacityStops),
);
check(glowProbe.lyricOff !== glowProbe.lyricOn, 'lyric glow changes the frame');
check((await page.locator('#lyricGlow').count()) === 1, 'lyrics have a glow slider');

// alignment is relative to the frame, and dragging never pushes the box out
await page.evaluate(() => {
  window.songframe.setConfig({
    preset: 'Minimal',
    bg: 'solid',
    particles: 0,
    text: [{ id: 'title', text: 'Frame centre', x: 12, y: 30, size: 60, color: '#ffffff', font: 'Segoe UI', bold: true, opacity: 1, align: 'left', glow: 0 }],
    lyrics: { ...window.songframe.getState().lyrics, enabled: false },
  });
  window.songframe.drawAt(1);
});
await page.click('.tab[data-tab="text"]');
await page.waitForTimeout(250);
if (await page.locator('.text-item .text-body').first().isHidden()) {
  await page.locator('.text-item .text-head').first().click();
  await page.waitForTimeout(200);
}
const clickAlign = async (label) => {
  const buttons = page.locator('.text-item .text-body [data-align]');
  const total = await buttons.count();
  for (let i = 0; i < total; i += 1) {
    const text = ((await buttons.nth(i).textContent()) || '').trim();
    if (text === label) {
      await buttons.nth(i).click();
      await page.waitForTimeout(140);
      return;
    }
  }
};
const textBox = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('#preview');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = 1e9;
    let maxX = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    return { left: (minX / canvas.width) * 100, right: (maxX / canvas.width) * 100 };
  });
await page.evaluate(() => window.songframe.setConfig({ showCredit: false }));
await clickAlign('Centre');
const centreBox = await textBox();
await clickAlign('Right');
const rightBox = await textBox();
await clickAlign('Left');
const leftBox = await textBox();
check(
  Math.abs((centreBox.left + centreBox.right) / 2 - 50) < 2.5 && Math.abs(rightBox.right - 94) < 2.5 && Math.abs(leftBox.left - 6) < 2.5,
  'alignment snaps the layer to the frame',
  JSON.stringify({ left: leftBox.left.toFixed(1), centre: ((centreBox.left + centreBox.right) / 2).toFixed(1), right: rightBox.right.toFixed(1) }),
);
await clickAlign('Centre');
const canvasBox = await page.locator('#preview').boundingBox();
await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.3);
await page.mouse.down();
await page.mouse.move(canvasBox.x + canvasBox.width * 0.95, canvasBox.y + canvasBox.height * 0.3, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(200);
const dragEdge = await textBox();
check(dragEdge.right <= 99.5, 'dragging keeps the text box inside the frame', `${dragEdge.right.toFixed(1)}%`);
await page.evaluate(() => window.songframe.setConfig({ text: [], lyrics: { ...window.songframe.getState().lyrics, enabled: false, glow: 0 } }));
await page.evaluate(() => window.songframe.setConfig({ text: [], lyrics: { ...window.songframe.getState().lyrics, enabled: false, glow: 0 } }));

// a missing fast encoder must be announced, not smuggled through as a normal MP4
const fastMode = await page.evaluate(async () => {
  window.songframe.setConfig({ height: 480, fps: 30, rangeStart: 0, rangeEnd: 1 });
  await window.songframe.exportVideo({ height: 480, fps: 30, maxSeconds: 1 });
  return { mode: window.songframe.lastExport.mode, mime: window.songframe.lastExport.mime };
});
check(fastMode.mode === 'webcodecs', 'the fast encoder is used when it is available', JSON.stringify(fastMode));

await page.evaluate(() => {
  window.__savedVideoEncoder = window.VideoEncoder;
  try {
    delete window.VideoEncoder;
  } catch {
    window.VideoEncoder = undefined;
  }
});
await page.evaluate(() => window.songframe.setConfig({ height: 480, fps: 30, rangeStart: 0, rangeEnd: 1 }));
await page.click('#btnRender');
let fallbackUi = null;
for (let waited = 0; waited < 120000; waited += 500) {
  fallbackUi = await page.evaluate(() => {
    const file = document.querySelector('#renderFile');
    const warn = document.querySelector('#renderWarn');
    const done = file && file.textContent.trim().length > 0;
    return done
      ? {
          name: file.textContent.trim(),
          warned: Boolean(warn && !warn.hidden && warn.textContent.trim().length > 0),
          mode: window.songframe.lastExport.mode,
        }
      : null;
  });
  if (fallbackUi) break;
  await page.waitForTimeout(500);
}
await page.evaluate(() => {
  window.VideoEncoder = window.__savedVideoEncoder;
});
check(
  Boolean(fallbackUi) && fallbackUi.mode === 'mediarecorder' && fallbackUi.name.endsWith('-realtime.mp4') && fallbackUi.warned,
  'a real-time render is named and flagged',
  JSON.stringify(fallbackUi),
);
const closeRender = await page.$('#btnCloseRender');
if (closeRender) await closeRender.click();
await page.waitForTimeout(300);

// a 256/320 kbps request must not void the fast path: negotiate, do not fall back
await page.evaluate(() => {
  const file = document.querySelector('#renderFile');
  if (file) file.textContent = '';
  window.songframe.setConfig({ height: 480, fps: 30, rangeStart: 0, rangeEnd: 1, audioKbps: 320 });
});
await page.click('#btnRender');
let cappedRender = null;
for (let waited = 0; waited < 120000; waited += 500) {
  cappedRender = await page.evaluate(() => {
    const file = document.querySelector('#renderFile');
    // Only accept the *fast* render; the previous real-time run left its own result behind.
    if (!file || !file.textContent.trim() || window.songframe.lastExport.mode !== 'webcodecs') return null;
    const warn = document.querySelector('#renderWarn');
    return {
      name: file.textContent.trim(),
      meta: (document.querySelector('#renderMeta') || {}).textContent || '',
      mode: window.songframe.lastExport.mode,
      audio: window.songframe.lastExport.audioBitrate,
      warned: Boolean(warn && !warn.hidden),
    };
  });
  if (cappedRender) break;
  await page.waitForTimeout(500);
}
check(
  Boolean(cappedRender) &&
    cappedRender.mode === 'webcodecs' &&
    !cappedRender.name.includes('-realtime') &&
    !cappedRender.warned &&
    cappedRender.audio > 0 &&
    cappedRender.audio <= 320000 &&
    cappedRender.meta.includes('audio capped at'),
  'a high audio bitrate is negotiated down instead of falling back',
  JSON.stringify(cappedRender),
);
const closeCapped = await page.$('#btnCloseRender');
if (closeCapped) await closeCapped.click();
await page.waitForTimeout(300);
await page.evaluate(() => window.songframe.setConfig({ audioKbps: 192 }));

// end silence extends the render with true (digital) silence
await page.evaluate(() => {
  const file = document.querySelector('#renderFile');
  if (file) file.textContent = '';
  window.songframe.setConfig({ height: 480, fps: 30, rangeStart: 0, rangeEnd: 1, audioKbps: 192, endSilence: 3 });
});
await page.click('#btnRender');
let padded = null;
for (let waited = 0; waited < 120000; waited += 500) {
  padded = await page.evaluate(() => {
    const file = document.querySelector('#renderFile');
    if (!file || !file.textContent.trim() || window.songframe.lastExport.mode !== 'webcodecs') return null;
    const duration = window.songframe.lastExport.duration;
    if (!(duration > 1)) return null;
    return {
      name: file.textContent.trim(),
      meta: (document.querySelector('#renderMeta') || {}).textContent || '',
      mode: window.songframe.lastExport.mode,
      duration,
    };
  });
  if (padded) break;
  await page.waitForTimeout(500);
}
check(
  Boolean(padded) && Math.abs(padded.duration - 4) < 0.15 && padded.meta.includes('+3 s silence'),
  'end silence extends the render with true silence',
  JSON.stringify(padded),
);
const closePadded = await page.$('#btnCloseRender');
if (closePadded) await closePadded.click();
await page.waitForTimeout(300);
await page.evaluate(() => window.songframe.setConfig({ endSilence: 0, rangeStart: 0, rangeEnd: 0 }));

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
