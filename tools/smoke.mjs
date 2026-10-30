// End-to-end smoke test: drives dist/songframe.html in headless Chrome from
// file://, checks every preset draws, and produces a real MP4 that ffprobe
// inspects. Run with: npm run smoke
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const outDir = join(appRoot, 'tools', 'out');
const page_url = pathToFileURL(join(appRoot, 'dist', 'songframe.html')).href;

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = browsers.find((path) => existsSync(path));
if (!executablePath) {
  console.error('No Chromium browser found.');
  process.exit(1);
}

const failures = [];
const check = (condition, label, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
};

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

console.log(`\nSongframe smoke test\n  ${page_url}\n`);
await page.goto(page_url);
await page.waitForFunction(() => Boolean(window.songframe?.ready), null, { timeout: 20000 });
check(true, 'app boots');

// --- build a 6 second test song inside the page -------------------------
const wavBase64 = await page.evaluate(() => {
  const rate = 44100;
  const seconds = 6;
  const frames = rate * seconds;
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
    const bar = Math.floor(t / 1.5) % chords.length;
    let value = 0;
    // A saw-ish stack, so the test song has harmonics up to the top bands
    // instead of a single sine that would leave most of a spectrum empty.
    for (const freq of chords[bar]) {
      for (let harmonic = 1; harmonic <= 7; harmonic++) {
        value += (Math.sin(2 * Math.PI * freq * harmonic * t) * 0.16) / harmonic;
      }
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
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(offset, Math.round(left[i] * 32767), true);
    view.setInt16(offset + 2, Math.round(right[i] * 32767), true);
    offset += 4;
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
});

const loaded = await page.evaluate(async (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], 'Smoke Test Song.wav', { type: 'audio/wav' });
  return window.songframe.loadAudioFile(file);
}, wavBase64);
check(Math.abs(loaded.duration - 6) < 0.25, 'song loads', `${loaded.name}, ${loaded.duration.toFixed(2)} s`);

const emptyHidden = await page.evaluate(() => document.querySelector('#emptyState')?.hasAttribute('hidden') ?? false);
const renderEnabled = await page.evaluate(() => !document.querySelector('#btnRender')?.hasAttribute('disabled'));
check(emptyHidden, 'dropzone clears');
check(renderEnabled, 'render button enables');

// --- every preset, every aspect ----------------------------------------
const presets = await page.evaluate(() => window.songframe.getState().preset);
const allPresets = ['NCS Circle', 'Linear Bars', 'Dual Mirror', 'Center Wave', 'Orbital', 'Hexagon', 'Oscilloscope', 'Digital Rain', 'Shockwave', 'Minimal', 'Waveform', 'Vinyl', 'Lyrics', 'Halo'];
let presetFailures = 0;
for (const preset of allPresets) {
  const result = await page.evaluate((name) => {
    try {
      window.songframe.setConfig({ preset: name });
      window.songframe.drawAt(2.4);
      return null;
    } catch (error) {
      return String(error);
    }
  }, preset);
  if (result) {
    presetFailures += 1;
    console.log(`  FAIL preset ${preset}: ${result}`);
    failures.push(`preset ${preset}`);
  }
}
check(presetFailures === 0, 'all presets draw', `${allPresets.length} checked, started on ${presets}`);

let aspectFailures = 0;
for (const aspect of ['16:9', '9:16', '1:1']) {
  const result = await page.evaluate((value) => {
    try {
      window.songframe.setConfig({ aspect: value });
      window.songframe.drawAt(1.2);
      return null;
    } catch (error) {
      return String(error);
    }
  }, aspect);
  if (result) {
    aspectFailures += 1;
    console.log(`  FAIL aspect ${aspect}: ${result}`);
    failures.push(`aspect ${aspect}`);
  }
}
check(aspectFailures === 0, 'all 3 aspect ratios draw');
await page.evaluate(() => window.songframe.setConfig({ aspect: '16:9' }));

const spectrum = await page.evaluate(() => {
  const frame = window.songframe.getFrame(2.4);
  if (!frame) return null;
  return { bass: frame.bass, mid: frame.mid, treble: frame.treble, bands: frame.bands };
});
check(Boolean(spectrum && spectrum.treble > 0.05), 'spectrum reaches the treble bands', spectrum ? `bass ${spectrum.bass.toFixed(2)} mid ${spectrum.mid.toFixed(2)} treble ${spectrum.treble.toFixed(2)}` : 'no frame');

// --- lyrics -------------------------------------------------------------
const lrc = `[00:00.00]Songframe smoke test
[00:01.00]<00:01.00>Every <00:01.50>line <00:02.00>should <00:02.50>sweep
[00:03.00][Chorus] Light it up
[00:04.20]And let it run
[00:05.20]To the end of the song`;
const lyricCount = await page.evaluate((text) => {
  window.songframe.loadLyrics(text);
  return window.songframe.getState().lyrics.enabled;
}, lrc);
check(Boolean(lyricCount), 'LRC lyrics load');

// --- screenshots --------------------------------------------------------
const shots = [
  ['shot-preset-ncs.png', 'NCS Circle', '16:9', 2.4],
  ['shot-preset-orbit.png', 'Orbital', '16:9', 1.6],
  ['shot-preset-rain.png', 'Digital Rain', '16:9', 3.1],
  ['shot-vertical.png', 'Hexagon', '9:16', 2.2],
  ['shot-preset-vinyl.png', 'Vinyl', '16:9', 2.4],
  ['shot-preset-wave.png', 'Waveform', '16:9', 2.4],
  ['shot-preset-lyrics.png', 'Lyrics', '16:9', 2.4],
];
for (const [file, preset, aspect, time] of shots) {
  await page.evaluate(({ preset, aspect, time }) => {
    window.songframe.setConfig({ preset, aspect });
    window.songframe.drawAt(time);
  }, { preset, aspect, time });
  await page.waitForTimeout(160);
  await page.locator('#frame').screenshot({ path: join(outDir, file) });
  console.log(`  shot ${file}`);
}
await page.evaluate(() => window.songframe.setConfig({ aspect: '16:9', preset: 'NCS Circle' }));
await page.screenshot({ path: join(outDir, 'shot-app.png') });
console.log('  shot shot-app.png');

// --- the actual render --------------------------------------------------
console.log('\n  rendering 3 s at 480p / 24 fps …');
const renderStart = Date.now();
const blob = await page.evaluate(async () => {
  const result = await window.songframe.exportVideo({ maxSeconds: 3, height: 480, fps: 24 });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(result);
  });
  return { base64, type: result.type, size: result.size };
});
const renderSeconds = (Date.now() - renderStart) / 1000;
const videoPath = join(outDir, 'smoke.mp4');
await writeFile(videoPath, Buffer.from(blob.base64, 'base64'));
check(blob.type === 'video/mp4', 'export returns MP4', `${blob.type}, ${(blob.size / 1024).toFixed(0)} KB in ${renderSeconds.toFixed(1)} s`);
check(blob.size > 100_000, 'export is not empty', `${(blob.size / 1024).toFixed(0)} KB`);

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,duration', '-of', 'json', videoPath], { encoding: 'utf8' });
if (probe.error) {
  console.log('  warn ffprobe unavailable — skipping stream checks');
} else {
  const info = JSON.parse(probe.stdout || '{}');
  const streams = info.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  check(Boolean(video), 'video stream present', video ? `${video.codec_name} ${video.width}x${video.height}` : '');
  check(Boolean(audio), 'audio stream present', audio ? `${audio.codec_name}` : '');
  check(video?.width === 854 && video?.height === 480, '480p 16:9 frame size', video ? `${video.width}x${video.height}` : '');
  const duration = Number(video?.duration ?? 0);
  check(Math.abs(duration - 3) < 0.4, 'duration is ~3 s', `${duration.toFixed(2)} s`);
}

// --- a vertical render, to prove the aspect maths ----------------------
console.log('  rendering 2 s at 720p 9:16 …');
const vertical = await page.evaluate(async () => {
  window.songframe.setConfig({ aspect: '9:16' });
  const blob = await window.songframe.exportVideo({ maxSeconds: 2, height: 720, fps: 30 });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { base64, size: blob.size, type: blob.type };
});
const verticalPath = join(outDir, 'smoke-vertical.mp4');
await writeFile(verticalPath, Buffer.from(vertical.base64, 'base64'));
check(vertical.type === 'video/mp4' && vertical.size > 50_000, 'vertical export produced', `${(vertical.size / 1024).toFixed(0)} KB`);

// --- a section render, the way a Short is cut out of a song --------
console.log('  rendering a 1 s range from 1.5 s …');
const section = await page.evaluate(async () => {
  window.songframe.setConfig({ aspect: '16:9', rangeStart: 1.5, rangeEnd: 2.5 });
  const blob = await window.songframe.exportVideo({ height: 480, fps: 24 });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { base64, size: blob.size, type: blob.type };
});
const sectionPath = join(outDir, 'smoke-range.mp4');
await writeFile(sectionPath, Buffer.from(section.base64, 'base64'));
check(section.type === 'video/mp4' && section.size > 40_000, 'range export produced', `${(section.size / 1024).toFixed(0)} KB`);
const rprobe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', sectionPath], { encoding: 'utf8' });
if (!rprobe.error) {
  const rinfo = JSON.parse(rprobe.stdout || '{}');
  const rduration = Number(rinfo.format?.duration ?? 0);
  check(Math.abs(rduration - 1) < 0.25, 'range is one second long', `${rduration.toFixed(2)} s`);
}
await page.evaluate(() => window.songframe.setConfig({ rangeStart: 0, rangeEnd: 0 }));
const vprobe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', verticalPath], { encoding: 'utf8' });
if (!vprobe.error) {
  const vinfo = JSON.parse(vprobe.stdout || '{}');
  const vvideo = (vinfo.streams ?? []).find((stream) => stream.codec_type !== 'audio' && stream.width);
  check(vvideo?.width === 720 && vvideo?.height === 1280, '720p 9:16 frame size', vvideo ? `${vvideo.width}x${vvideo.height}` : 'none');
}

check(consoleErrors.length === 0, 'no console errors', consoleErrors.slice(0, 3).join(' | '));

await browser.close();

console.log(`\n${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} — artefacts in ${outDir}\n`);
if (failures.length > 0) process.exit(1);
