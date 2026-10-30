import { decodeSong, frameAt, Playback, type Song } from './audio';
import defaultLogoUrl from './assets/logo.webp';
import { initialsOf, loadImageFile, loadImageUrl, loadVideoFile, loadVideoUrl, makeCoverArt } from './backgrounds';
import { fontFamily, hydrateSystemFonts } from './fonts';
import { exportFrame, exportVideo, frameSize, type ExportResult } from './export';
import { parseLyrics } from './lyrics';
import { creditLine, resolveFullSize, type MediaItem } from './media';
import { createMediaPicker, PATTERN_NAMES } from './media-ui';
import { applyTheme, currentThemeId, THEMES } from './theme';
import { ASPECTS, PALETTES, defaultConfig, formatTime, hashString, slugify } from './presets';
import type { Config, EffectKey, Frame, LyricLine, PresetId, TextLayer } from './types';
import * as ui from './ui';
import { renderFrame, type Assets } from './visualizer';

const playback = new Playback();

let picker: { open: (tab?: 'photo' | 'video' | 'pattern', target?: 'background' | 'center') => void } | null = null;

interface State {
  config: Config;
  song: Song | null;
  lyrics: LyricLine[];
  assets: Assets;
  activeTextId: string | null;
  customCover: HTMLImageElement | null;
  generatedCover: HTMLCanvasElement | null;
  logoImage: HTMLImageElement | null;
  useGeneratedArt: boolean;
  volume: number;
  muted: boolean;
  exporting: boolean;
  frozenTime: number | null;
  version: number;
  lastTextSig: string;
  lastExportUrl: string;
  backgroundCredit: string;
  centreCredit: string;
  lastExportName: string;
  lastExportPath: string;
  lastExport: { blob: Blob | null; mime: string; bytes: number };
}

const state: State = {
  config: defaultConfig(),
  song: null,
  lyrics: [],
  assets: { cover: null, background: null, backgroundVideo: null },
  activeTextId: 'title',
  customCover: null,
  generatedCover: null,
  logoImage: null,
  useGeneratedArt: false,
  volume: 1,
  muted: false,
  exporting: false,
  frozenTime: null,
  version: 0,
  lastTextSig: '',
  lastExportUrl: '',
  backgroundCredit: '',
  centreCredit: '',
  lastExportName: '',
  lastExportPath: '',
  lastExport: { blob: null, mime: '', bytes: 0 },
};

let abortController: AbortController | null = null;
let lastDrawKey = '';
let lastVideoRetry = 0;

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function titleFromFile(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/^\s*\d{1,3}\s*[-._]\s*/, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() || 'Untitled'
  );
}

function downloadBlob(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return url;
}

interface DesktopBridge {
  save_begin: (filename: string, kind?: string) => Promise<{ ok: boolean; cancelled?: boolean; token?: string }>;
  save_chunk: (token: string, data: string) => Promise<{ ok: boolean; written?: number; error?: string }>;
  save_end: (token: string) => Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }>;
  save_cancel: (token: string) => Promise<{ ok: boolean }>;
  reveal: (path: string) => Promise<{ ok: boolean }>;
  set_title: (title: string) => Promise<{ ok: boolean }>;
}

/** The Python shell, when the studio runs as a desktop window. */
function desktop(): DesktopBridge | null {
  const bridge = (window as unknown as { pywebview?: { api?: DesktopBridge } }).pywebview;
  return bridge?.api ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves through the desktop shell when it is there (native Save dialog, real
 * file on disk), and falls back to a browser download otherwise. Big exports
 * are streamed in 4 MB slices rather than one enormous string.
 */
async function persistBlob(
  blob: Blob,
  filename: string,
  kind: 'video' | 'image' | 'look',
): Promise<{ saved: boolean; path?: string; url?: string }> {
  const api = desktop();
  if (!api) return { saved: true, url: downloadBlob(blob, filename) };

  const begin = await api.save_begin(filename, kind);
  if (!begin?.ok || !begin.token) return { saved: false };
  const token = begin.token;
  try {
    const sliceSize = 4 * 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += sliceSize) {
      const part = await blobToBase64(blob.slice(offset, offset + sliceSize));
      const chunk = await api.save_chunk(token, part);
      if (!chunk?.ok) throw new Error(chunk?.error ?? 'the file could not be written');
    }
    const end = await api.save_end(token);
    if (!end?.ok) throw new Error(end?.error ?? 'the file could not be saved');
    return { saved: true, path: end.path };
  } catch (error) {
    await api.save_cancel(token);
    throw error;
  }
}

function readFileText(file: File): Promise<string> {
  return file.text();
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * preview rendering
 * ------------------------------------------------------------------ */

function fitFrame(): void {
  const host = document.querySelector<HTMLElement>('#stageFrame');
  const frameEl = document.querySelector<HTMLElement>('#frame');
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!host || !frameEl || !canvas) return;
  const aspect = ASPECTS.find((entry) => entry.id === state.config.aspect) ?? ASPECTS[0];
  const ratio = aspect.w / aspect.h;
  const box = host.getBoundingClientRect();
  const maxWidth = Math.max(200, box.width - 4);
  const maxHeight = Math.max(160, box.height - 4);
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  width = Math.floor(width);
  height = Math.floor(height);
  frameEl.style.width = `${width}px`;
  frameEl.style.height = `${height}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bufferWidth = Math.max(2, Math.round(width * dpr));
  const bufferHeight = Math.max(2, Math.round(height * dpr));
  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
    lastDrawKey = '';
  }
}

/**
 * A clip background has to be *played* to move; drawing a paused <video> just
 * repeats its first frame. It is paused while exporting, because the export
 * seeks it frame by frame and playback would fight those seeks.
 */
function keepBackgroundVideoAlive(): void {
  const video = state.assets.backgroundVideo;
  if (!video) return;
  const wanted = state.config.bg === 'video' && !state.exporting;
  if (!wanted) {
    if (!video.paused) video.pause();
    return;
  }
  if (!video.paused) return;
  const now = performance.now();
  if (now - lastVideoRetry < 1000) return;
  lastVideoRetry = now;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  void video.play().catch(() => undefined);
}

function startBackgroundVideo(): void {
  const video = state.assets.backgroundVideo;
  if (!video) return;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  lastVideoRetry = performance.now();
  void video.play().catch(() => undefined);
}

function demoFrame(time: number): Frame {
  const bands = new Float32Array(96);
  for (let i = 0; i < bands.length; i++) {
    const swell = 0.5 + 0.5 * Math.sin(time * 1.1 + i * 0.19);
    const ripple = 0.5 + 0.5 * Math.sin(time * 2.4 + i * 0.055);
    bands[i] = Math.max(0.05, Math.min(1, 0.18 + swell * 0.3 + ripple * 0.18 - i * 0.0016));
  }
  const wave = new Float32Array(1024);
  for (let i = 0; i < wave.length; i++) {
    wave[i] = Math.sin((i / wave.length) * Math.PI * 8 + time * 2.2) * 0.22 * (0.6 + 0.4 * Math.sin(time * 1.7));
  }
  return { t: time, bands, wave, bass: 0.42, mid: 0.38, treble: 0.24, energy: 0.3 };
}

function drawPreview(time: number): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const frame = state.song ? frameAt(state.song, time, state.config.sensitivity) : demoFrame(time);
  // Before a song is loaded the canvas is only a backdrop for the drop card:
  // the placeholder title and lyrics would read as part of the empty state.
  const config = state.song
    ? state.config
    : { ...state.config, text: [], lyrics: { ...state.config.lyrics, enabled: false } };
  renderFrame(ctx, canvas.width, canvas.height, {
    config,
    frame,
    assets: state.assets,
    lyrics: state.song ? state.lyrics : [],
    duration: state.song?.duration ?? 24,
    peaks: state.song?.peaks,
  });
}

function tick(): void {
  requestAnimationFrame(tick);
  fitFrame();
  keepBackgroundVideoAlive();
  const duration = state.song?.duration ?? 0;
  const time = state.frozenTime ?? (state.song ? playback.time : (performance.now() / 1000) % 24);
  // A playing clip changes on its own, so the frame is never "unchanged".
  const clip = state.assets.backgroundVideo;
  const liveClip = state.config.bg === 'video' && clip !== null && !clip.paused && !state.exporting;
  const key = liveClip
    ? `${time.toFixed(3)}|${state.version}|${clip!.currentTime.toFixed(3)}|clip`
    : `${time.toFixed(3)}|${state.version}|${state.config.aspect}|${state.song ? 'song' : 'demo'}`;
  if (key !== lastDrawKey) {
    lastDrawKey = key;
    drawPreview(time);
    updateTransport(time, duration);
  }
}

/* ------------------------------------------------------------------ *
 * chrome sync
 * ------------------------------------------------------------------ */

function updateTransport(time: number, duration: number): void {
  ui.updateTimeLabels(time, duration);
  const seek = document.querySelector<HTMLInputElement>('#seekRange');
  if (seek && !seek.matches(':active')) {
    seek.value = String(duration > 0 ? Math.round((time / duration) * 1000) : 0);
  }
  const canvas = document.querySelector<HTMLCanvasElement>('#seekCanvas');
  if (canvas) ui.drawSeekWave(canvas, state.song?.peaks ?? null, duration > 0 ? time / duration : 0, state.config.primary);
  const play = document.querySelector<HTMLButtonElement>('#btnPlay');
  if (play) {
    play.querySelector('.icon-play')?.toggleAttribute('hidden', playback.playing);
    play.querySelector('.icon-pause')?.toggleAttribute('hidden', !playback.playing);
    play.setAttribute('aria-label', playback.playing ? 'Pause' : 'Play');
  }
}

function syncChrome(): void {
  const config = state.config;
  const size = frameSize(config);
  const chip = document.querySelector('#formatChip');
  if (chip) chip.textContent = `${config.aspect} · ${config.height}p · ${config.fps} fps`;
  const badge = document.querySelector('#stageBadge');
  if (badge) badge.textContent = config.aspect;
  const metaLeft = document.querySelector('#metaLeft');
  if (metaLeft) {
    metaLeft.textContent = state.song
      ? `${state.song.name.replace(/\.[^.]+$/, '')} · ${formatTime(state.song.duration)}`
      : 'No song loaded · preview is a demo';
  }
  const metaRight = document.querySelector('#metaRight');
  if (metaRight) metaRight.textContent = `${size.width}×${size.height} · H.264 + AAC · rendered on this machine`;

  const count = state.song && state.lyrics.length > 0 ? `${state.lyrics.length} lyric lines` : '';
  const lyricStatus = document.querySelector('#lyricStatus');
  if (lyricStatus) lyricStatus.textContent = count || 'No lyrics loaded';

  const values: Record<string, string> = {
    '#particlesOut': String(config.particles),
    '#qualityOut': config.quality <= 0.75 ? 'Small' : config.quality <= 1 ? 'Balanced' : 'High',
    '#dimOut': `${Math.round(config.dim * 100)}%`,
    '#sensitivityOut': `${Math.round(config.sensitivity * 100)}%`,
    '#barsOut': String(Math.round(config.bars)),
    '#scaleOut': `${Math.round(config.scale * 100)}%`,
    '#opacityOut': `${Math.round(config.visualizerOpacity * 100)}%`,
    '#lyricSizeOut': String(Math.round(config.lyrics.size)),
    '#lyricLinesOut': String(config.lyrics.lines),
    '#lyricOffsetOut': `${config.lyrics.offset.toFixed(1)} s`,
    '#lyricPillOpacityOut': `${Math.round(config.lyrics.pillOpacity * 100)}%`,
    '#lyricGlowOut': `${Math.round((config.lyrics.glow ?? 0) * 100)}%`,
    '#primaryHex': config.primary.toUpperCase(),
    '#secondaryHex': config.secondary.toUpperCase(),
  };
  for (const [selector, text] of Object.entries(values)) {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  }

  const lyricFont = document.querySelector<HTMLSelectElement>('#lyricFont');
  if (lyricFont) {
    if (lyricFont.options.length === 0) ui.buildFontSelect(lyricFont, config.lyrics.font);
    else if (document.activeElement !== lyricFont) lyricFont.value = config.lyrics.font;
  }

  const rangeStartInput = document.querySelector<HTMLInputElement>('#rangeStart');
  if (rangeStartInput && document.activeElement !== rangeStartInput) rangeStartInput.value = String(Math.round(config.rangeStart * 10) / 10);
  const rangeEndInput = document.querySelector<HTMLInputElement>('#rangeEnd');
  if (rangeEndInput && document.activeElement !== rangeEndInput) rangeEndInput.value = String(Math.round(config.rangeEnd * 10) / 10);

  const setRange = (selector: string, value: number): void => {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input || document.activeElement === input) return;
    input.value = String(value);
    ui.paintRange(input);
  };
  setRange('#particles', config.particles);
  setRange('#quality', Math.round(config.quality * 100));
  setRange('#dim', Math.round(config.dim * 100));
  setRange('#sensitivity', Math.round(config.sensitivity * 100));
  setRange('#bars', Math.round(config.bars));
  setRange('#scale', Math.round(config.scale * 100));
  setRange('#opacity', Math.round(config.visualizerOpacity * 100));
  setRange('#lyricSize', Math.round(config.lyrics.size));
  setRange('#lyricLines', config.lyrics.lines);
  setRange('#lyricOffset', Math.round(config.lyrics.offset * 10));
  setRange('#lyricPillOpacity', Math.round(config.lyrics.pillOpacity * 100));
  setRange('#lyricGlow', Math.round((config.lyrics.glow ?? 0) * 100));
  setRange('#seekRange', 0);

  const colorInputs: [string, string][] = [
    ['#primary', config.primary],
    ['#secondary', config.secondary],
    ['#lyricColor', config.lyrics.color],
    ['#lyricHighlight', config.lyrics.highlight],
    ['#lyricPill', config.lyrics.pill],
  ];
  for (const [selector, value] of colorInputs) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input && document.activeElement !== input) input.value = value;
  }
  const sections = document.querySelector<HTMLInputElement>('#lyricSections');
  if (sections) sections.checked = config.lyrics.showSections;

  ui.syncPresetGrid(config.preset);
  ui.syncSwatches(config.primary);
  ui.buildSegments(config, segmentHandlers);

  const signature = JSON.stringify(config.text) + String(state.activeTextId);
  if (signature !== state.lastTextSig) {
    state.lastTextSig = signature;
    ui.renderTextList(config.text, state.activeTextId, textHandlers);
  }

  renderBackgroundTools();
  updateCoverThumb();
}

/** One credit line for the frame: the backdrop first, then the centre image. */
function syncCredit(): void {
  const parts = Array.from(new Set([state.backgroundCredit, state.centreCredit].filter(Boolean)));
  state.config.credit = parts.join(' · ');
  const node = document.querySelector<HTMLElement>('#coverCredit');
  if (node) {
    node.textContent = state.centreCredit;
    node.hidden = !state.centreCredit;
  }
}

function showStageHint(): void {
  const hint = document.querySelector<HTMLElement>('#stageHint');
  if (!hint) return;
  hint.hidden = false;
  hint.style.opacity = '1';
  window.setTimeout(() => {
    hint.style.opacity = '0';
    window.setTimeout(() => {
      hint.hidden = true;
    }, 700);
  }, 7000);
}

/** Keeps the open layer's sliders in step with a canvas drag or wheel. */
function syncActiveLayerControls(): void {
  const item = document.querySelector<HTMLElement>('.text-item.is-active');
  const layer = state.config.text.find((entry) => entry.id === state.activeTextId);
  if (!item || !layer) return;
  const pairs: [string, number][] = [
    ['#textList .text-item.is-active [data-field="size"]', layer.size],
    ['#textList .text-item.is-active [data-field="opacity"]', layer.opacity * 100],
  ];
  for (const [selector, value] of pairs) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input || document.activeElement === input) continue;
    input.value = String(Math.round(value));
    ui.paintRange(input);
    const output = input.closest('.field')?.querySelector('output');
    if (output) output.textContent = selector.includes('opacity') ? `${Math.round(value)}%` : String(Math.round(value));
  }
}

function commit(mutate: () => void): void {
  mutate();
  state.version += 1;
  syncChrome();
}

/* ------------------------------------------------------------------ *
 * panel builders + handlers
 * ------------------------------------------------------------------ */

const segmentHandlers = {
  setAspect: (value: Config['aspect']) => commit(() => { state.config.aspect = value; fitFrame(); }),
  setHeight: (value: Config['height']) => commit(() => { state.config.height = value; }),
  setFps: (value: Config['fps']) => commit(() => { state.config.fps = value; }),
  setBitrate: (value: Config['audioKbps']) => commit(() => { state.config.audioKbps = value; }),
  setBg: (value: Config['bg']) => commit(() => { state.config.bg = value; void prepareBackground(); }),
  setLyricStyle: (value: Config['lyrics']['style']) => commit(() => { state.config.lyrics.style = value; }),
  setLyricPos: (value: Config['lyrics']['pos']) => commit(() => { state.config.lyrics.pos = value; }),
};

const textHandlers = {
  select: (id: string) => {
    state.activeTextId = state.activeTextId === id ? null : id;
    state.lastTextSig = '';
    syncChrome();
  },
  update: (id: string, patch: Partial<TextLayer>) => {
    const layer = state.config.text.find((entry) => entry.id === id);
    if (!layer) return;
    Object.assign(layer, patch);
    if (patch.align) {
      // Alignment is relative to the frame: Left/Centre/Right put the box there.
      const target = patch.align === 'left' ? 6 : patch.align === 'right' ? 94 : 50;
      layer.x = clampTextX(layer, target);
      syncActiveLayerControls();
    }
    // Redraw only: rebuilding the panel (with hundreds of font options) on every
    // pointer event is what made the sliders feel like they moved in steps.
    state.version += 1;
  },
  remove: (id: string) => {
    state.config.text = state.config.text.filter((entry) => entry.id !== id);
    if (state.activeTextId === id) state.activeTextId = null;
    state.lastTextSig = '';
    commit(() => undefined);
  },
};

function refreshTextList(): void {
  state.lastTextSig = '';
  syncChrome();
}

function addTextLayer(): void {
  const layer: TextLayer = {
    id: `t${Date.now().toString(36)}`,
    text: 'New text',
    x: 50,
    y: 40,
    size: 44,
    color: '#ffffff',
    font: 'Inter',
    bold: true,
    opacity: 1,
    align: 'center',
  };
  state.config.text.push(layer);
  state.activeTextId = layer.id;
  refreshTextList();
}

function renderBackgroundTools(): void {
  const host = document.querySelector('#bgTools');
  if (!host) return;
  const config = state.config;
  host.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'bg-row';

  const browse = document.createElement('button');
  browse.className = 'btn primary small';
  browse.type = 'button';
  browse.textContent = 'Browse library';
  browse.addEventListener('click', () => picker?.open(config.bg === 'video' ? 'video' : 'photo'));
  row.appendChild(browse);

  if (config.bg === 'generated' || config.bg === 'pattern') {
    const shuffle = document.createElement('button');
    shuffle.className = 'btn ghost small';
    shuffle.type = 'button';
    shuffle.textContent = 'Shuffle';
    shuffle.addEventListener('click', () => {
      if (config.bg === 'pattern') {
        commit(() => {
          state.config.pattern = Math.floor(Math.random() * 12);
        });
      } else {
        state.config.bgSeed = Math.floor(Math.random() * 100000) + 1;
        commit(() => undefined);
      }
    });
    row.appendChild(shuffle);
  }

  if (config.bg === 'image' || config.bg === 'video') {
    const thumb = document.createElement('div');
    thumb.className = 'bg-thumb';
    if (config.bg === 'image' && state.assets.background) {
      thumb.style.backgroundImage = `url("${state.assets.background.src}")`;
    } else if (config.bg === 'video') {
      thumb.style.backgroundImage = 'linear-gradient(135deg,#2a2333,#131319)';
    }
    row.appendChild(thumb);
  }

  host.appendChild(row);

  const note = document.createElement('p');
  note.className = 'bg-note';
  if (config.bg === 'generated') {
    note.textContent = 'A procedural scene built from your palette.';
  } else if (config.bg === 'pattern') {
    note.textContent = `Pattern: ${PATTERN_NAMES[config.pattern] ?? PATTERN_NAMES[0]} — drawn on this machine, no connection needed.`;
  } else if (config.bg === 'image') {
    note.textContent = state.assets.background ? 'Picture ready.' : 'No picture yet — open the library.';
  } else if (config.bg === 'video') {
    note.textContent = state.assets.backgroundVideo ? 'Clip ready, looped for the whole song.' : 'No clip yet — open the library.';
  } else {
    note.textContent = 'A deep black frame with a faint glow behind the visualizer.';
  }
  host.appendChild(note);

  if (config.credit.trim()) {
    const credit = document.createElement('p');
    credit.className = 'bg-note credit';
    credit.textContent = config.credit;
    const toggle = document.createElement('label');
    toggle.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = config.showCredit;
    box.addEventListener('change', () => commit(() => { state.config.showCredit = box.checked; }));
    toggle.append(box, document.createTextNode(' Show credit in the video'));
    host.append(credit, toggle);
  }
}

function updateCoverThumb(): void {
  const thumb = document.querySelector<HTMLElement>('#coverThumb');
  if (!thumb) return;
  const cover = state.assets.cover;
  if (!cover) {
    thumb.style.backgroundImage = 'none';
    return;
  }
  const source = cover instanceof HTMLCanvasElement ? cover.toDataURL() : cover.src;
  thumb.style.backgroundImage = `url("${source}")`;
}

async function prepareBackground(): Promise<void> {
  const config = state.config;
  if (config.bg === 'image' && !state.assets.background) {
    (document.querySelector<HTMLInputElement>('#fileImage'))?.click();
  } else if (config.bg === 'video' && !state.assets.backgroundVideo) {
    (document.querySelector<HTMLInputElement>('#fileVideo'))?.click();
  }
}

function generatedCover(): HTMLCanvasElement {
  const name = state.song?.name ?? 'Songframe';
  state.generatedCover = makeCoverArt(
    initialsOf(name),
    state.config.primary,
    state.config.secondary,
    hashString(name.replace(/\.[^.]+$/, '')),
  );
  return state.generatedCover;
}

/**
 * Centre art resolves in this order: a chosen picture, generated initials, and
 * otherwise the studio's own logo, which ships inside the bundle.
 */
function refreshCover(): void {
  if (state.customCover) {
    state.assets.cover = state.customCover;
    updateCoverThumb();
    return;
  }
  if (state.useGeneratedArt) {
    state.assets.cover = generatedCover();
    updateCoverThumb();
    return;
  }
  if (state.logoImage) {
    state.assets.cover = state.logoImage;
    updateCoverThumb();
    return;
  }
  // Show something immediately, then swap to the logo once it decodes.
  state.assets.cover = generatedCover();
  updateCoverThumb();
  void loadImageUrl(defaultLogoUrl)
    .then((image) => {
      state.logoImage = image;
      if (!state.customCover && !state.useGeneratedArt) {
        state.assets.cover = image;
        state.version += 1;
        updateCoverThumb();
      }
    })
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ *
 * loading media
 * ------------------------------------------------------------------ */

function clearSong(): void {
  playback.pause();
  playback.setSong(null);
  if (state.assets.backgroundVideo) {
    state.assets.backgroundVideo.pause();
    state.assets.backgroundVideo = null;
  }
  state.song = null;
  state.lyrics = [];
  state.frozenTime = null;
  state.customCover = null;
  state.useGeneratedArt = false;
  state.assets.cover = null;
  state.backgroundCredit = '';
  state.centreCredit = '';
  state.config.rangeStart = 0;
  state.config.rangeEnd = 0;
  state.config.lyrics.enabled = false;
  state.config.text = defaultConfig().text;
  state.activeTextId = 'title';
  syncCredit();

  const empty = document.querySelector<HTMLElement>('#emptyState');
  if (empty) empty.hidden = false;
  for (const selector of ['#btnRender', '#btnPlay', '#btnExportFrame', '#btnNewSong']) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button) button.disabled = true;
  }
  const seek = document.querySelector<HTMLInputElement>('#seekRange');
  if (seek) seek.value = '0';

  document.title = 'Songframe Studio';
  void desktop()?.set_title('');
  lastDrawKey = '';
  refreshCover();
  fitFrame();
  state.version += 1;
  syncChrome();
  updateTransport(0, 0);
}

async function loadAnotherSong(): Promise<void> {
  if (!state.song) return;
  const confirmed = await ui.confirmAction({
    title: 'Load another song?',
    message: 'The current song, its lyrics and the text layers are cleared. Your look — preset, colours, background, effects — stays.',
    confirmLabel: 'Clear the song',
  });
  if (!confirmed) return;
  clearSong();
  ui.toast('Song cleared — drop the next one.');
}

async function resetEverything(): Promise<void> {
  const confirmed = await ui.confirmAction({
    title: 'Reset everything?',
    message: 'Song, text, lyrics, background, preset and effects all return to the starting setup. Looks saved to disk are not touched.',
    confirmLabel: 'Reset',
  });
  if (!confirmed) return;
  clearSong();
  state.config = defaultConfig();
  state.customCover = null;
  state.useGeneratedArt = false;
  state.assets = { cover: null, background: null, backgroundVideo: null };
  state.activeTextId = 'title';
  rebuildFx();
  refreshTextList();
  refreshCover();
  fitFrame();
  state.version += 1;
  syncChrome();
  ui.toast('Everything is back to the defaults.');
}

async function loadAudio(file: File): Promise<void> {
  if (!file) return;
  try {
    ui.toast(`Reading ${file.name}…`);
    const song = await decodeSong(file, playback.ctx);
    state.song = song;
    state.frozenTime = null;
    playback.setSong(song);
    state.lyrics = [];
    state.customCover = null;

    const seed = hashString(song.name);
    const palette = PALETTES[seed % PALETTES.length];
    const title = titleFromFile(song.name);

    commit(() => {
      state.config.text[0].text = title;
      state.config.text[1].text = 'Songframe Studio';
      state.config.bgSeed = (seed % 9999) + 1;
      state.config.credit = '';
      state.config.rangeStart = 0;
      state.config.rangeEnd = 0;
      state.backgroundCredit = '';
      state.centreCredit = '';
      state.config.primary = palette.primary;
      state.config.secondary = palette.secondary;
      state.config.lyrics.enabled = false;
    });
    document.title = `${title} · Songframe Studio`;
    void desktop()?.set_title(title);

    const empty = document.querySelector<HTMLElement>('#emptyState');
    if (empty) empty.hidden = true;
    const render = document.querySelector<HTMLButtonElement>('#btnRender');
    if (render) render.disabled = false;
    const frameBtn = document.querySelector<HTMLButtonElement>('#btnExportFrame');
    if (frameBtn) frameBtn.disabled = false;
    const eject = document.querySelector<HTMLButtonElement>('#btnNewSong');
    if (eject) eject.disabled = false;
    const play = document.querySelector<HTMLButtonElement>('#btnPlay');
    if (play) play.disabled = false;
    const lyricText = document.querySelector<HTMLTextAreaElement>('#lyricText');
    if (lyricText) lyricText.value = '';

    refreshCover();
    fitFrame();
    syncChrome();
    updateTransport(0, song.duration);
    showStageHint();
    ui.toast(`Loaded ${file.name} · ${formatTime(song.duration)}`);
  } catch (error) {
    console.error(error);
    ui.toast('That audio file could not be decoded. Try MP3, WAV, FLAC, OGG or M4A.', 'err');
  }
}

async function loadBackgroundImage(file: File): Promise<void> {
  try {
    state.assets.background = await loadImageFile(file);
    commit(() => { state.config.bg = 'image'; });
    state.backgroundCredit = '';
    syncCredit();
    ui.toast('Background image ready.');
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : 'That image could not be read.', 'err');
  }
}

async function loadBackgroundVideo(file: File): Promise<void> {
  try {
    state.assets.backgroundVideo = await loadVideoFile(file);
    startBackgroundVideo();
    commit(() => { state.config.bg = 'video'; });
    state.backgroundCredit = '';
    syncCredit();
    ui.toast('Background video ready — it loops for the whole song.');
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : 'That video could not be read.', 'err');
  }
}

async function loadCoverImage(file: File): Promise<void> {
  try {
    state.customCover = await loadImageFile(file);
    state.useGeneratedArt = false;
    state.centreCredit = '';
    refreshCover();
    syncCredit();
    ui.toast('Centre image updated.');
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : 'That image could not be read.', 'err');
  }
}

function applyLyricText(text: string): void {
  const duration = state.song?.duration ?? 0;
  const lines = parseLyrics(text, duration);
  if (lines.length === 0) {
    ui.toast('No lyric lines found in that text.', 'err');
    return;
  }
  state.lyrics = lines;
  commit(() => { state.config.lyrics.enabled = true; });
  const area = document.querySelector<HTMLTextAreaElement>('#lyricText');
  if (area) area.value = lines.map((line) => line.text).join('\n');
  ui.toast(`${lines.length} lyric lines loaded.`);
}

async function loadLyrics(file: File): Promise<void> {
  try {
    applyLyricText(await readFileText(file));
  } catch {
    ui.toast('That lyric file could not be read.', 'err');
  }
}

/* ------------------------------------------------------------------ *
 * export
 * ------------------------------------------------------------------ */

function resetModal(): void {
  const modal = document.querySelector<HTMLElement>('#renderModal');
  if (modal) modal.hidden = false;
  const close = document.querySelector<HTMLButtonElement>('#btnCloseRender');
  if (close) close.hidden = true;
  const cancel = document.querySelector<HTMLButtonElement>('#btnCancelRender');
  if (cancel) cancel.hidden = false;
  const result = document.querySelector<HTMLElement>('#renderResult');
  if (result) result.hidden = true;
  ui.modalProgress('Preparing', 0, '');
}

function closeModal(): void {
  const modal = document.querySelector<HTMLElement>('#renderModal');
  if (modal) modal.hidden = true;
}

async function startRender(): Promise<void> {
  if (!state.song || state.exporting) return;
  state.exporting = true;
  abortController = new AbortController();
  resetModal();

  const song = state.song;
  const config = structuredClone(state.config);
  const lyrics = state.lyrics.slice();

  try {
    const result: ExportResult = await exportVideo({
      song,
      config,
      assets: state.assets,
      lyrics,
      signal: abortController.signal,
      startAt: config.rangeStart,
      endAt: config.rangeEnd,
      onProgress: (stage, fraction, detail) => ui.modalProgress(stage, fraction, detail),
    });

    const filename = `songframe-${slugify(song.name)}-${result.height}p.${result.extension}`;
    const saved = await persistBlob(result.blob, filename, 'video');
    if (!saved.saved) {
      state.exporting = false;
      closeModal();
      ui.toast('The video was rendered but not saved.', 'err');
      return;
    }
    if (state.lastExportUrl) URL.revokeObjectURL(state.lastExportUrl);
    state.lastExportUrl = saved.url ?? '';
    state.lastExportName = filename;
    state.lastExportPath = saved.path ?? '';
    state.lastExport = { blob: result.blob, mime: result.mime, bytes: result.blob.size };

    const title = document.querySelector('#renderTitle');
    if (title) title.textContent = 'Your video is ready';
    const sub = document.querySelector('#renderSub');
    if (sub) sub.textContent = saved.path ? `Saved to ${saved.path}` : 'Saved to your downloads folder.';
    const file = document.querySelector('#renderFile');
    if (file) file.textContent = filename;
    const meta = document.querySelector('#renderMeta');
    if (meta) {
      meta.textContent = `${result.width}×${result.height} · ${formatTime(result.duration)} · ${bytesLabel(result.blob.size)} · ${result.mime}`;
    }
    const again = document.querySelector<HTMLAnchorElement>('#btnDownloadAgain');
    if (again) {
      again.href = saved.url ?? '#';
      again.hidden = !saved.url;
    }
    const reveal = document.querySelector<HTMLButtonElement>('#btnReveal');
    if (reveal) reveal.hidden = !saved.path;
    const resultBox = document.querySelector<HTMLElement>('#renderResult');
    if (resultBox) resultBox.hidden = false;
    const cancel = document.querySelector<HTMLButtonElement>('#btnCancelRender');
    if (cancel) cancel.hidden = true;
    const close = document.querySelector<HTMLButtonElement>('#btnCloseRender');
    if (close) close.hidden = false;
    ui.modalProgress('Done', 1, `${bytesLabel(result.blob.size)} · ${result.mime}`);
    ui.toast(`Rendered ${filename}`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      ui.toast('Render cancelled.');
      closeModal();
    } else {
      console.error(error);
      const sub = document.querySelector('#renderSub');
      if (sub) sub.textContent = 'The render failed.';
      ui.modalProgress('Failed', 0, error instanceof Error ? error.message : String(error));
      const cancel = document.querySelector<HTMLButtonElement>('#btnCancelRender');
      if (cancel) cancel.hidden = true;
      const close = document.querySelector<HTMLButtonElement>('#btnCloseRender');
      if (close) close.hidden = false;
      ui.toast(error instanceof Error ? error.message : 'The render failed.', 'err');
    }
  } finally {
    state.exporting = false;
    abortController = null;
  }
}

async function saveFrame(): Promise<void> {
  if (!state.song) return;
  try {
    const blob = await exportFrame(state.song, state.config, state.assets, state.lyrics, playback.time);
    const saved = await persistBlob(blob, `songframe-${slugify(state.song.name)}-${Math.round(playback.time)}s.png`, 'image');
    ui.toast(saved.path ? `Frame saved to ${saved.path}` : 'Frame saved as PNG.');
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : 'The frame could not be saved.', 'err');
  }
}

/* ------------------------------------------------------------------ *
 * look files
 * ------------------------------------------------------------------ */

function saveLook(): void {
  const payload = { app: 'songframe', version: 1, config: state.config };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const name = slugify(state.config.text[0]?.text || 'songframe-look');
  void persistBlob(blob, `${name}.songframe.json`, 'look').then((saved) => {
    if (!saved.saved) return;
    ui.toast(saved.path ? `Look saved to ${saved.path}` : 'Look saved. Load it on any song.');
  });
}

async function loadLook(file: File): Promise<void> {
  try {
    const parsed = JSON.parse(await readFileText(file)) as { config?: Partial<Config> };
    if (!parsed?.config) throw new Error('That file has no look in it.');
    const incoming = parsed.config;
    const merged: Config = {
      ...state.config,
      ...incoming,
      effects: { ...state.config.effects, ...(incoming.effects ?? {}) },
      amounts: { ...state.config.amounts, ...(incoming.amounts ?? {}) },
      lyrics: { ...state.config.lyrics, ...(incoming.lyrics ?? {}) },
      text: Array.isArray(incoming.text) && incoming.text.length > 0 ? incoming.text : state.config.text,
    };
    state.config = merged;
    state.activeTextId = state.config.text[0]?.id ?? null;
    rebuildFx();
    refreshCover();
    refreshTextList();
    fitFrame();
    ui.toast('Look loaded.');
  } catch (error) {
    ui.toast(error instanceof Error ? error.message : 'That look could not be read.', 'err');
  }
}

function rebuildFx(): void {
  ui.buildFxList(state.config, {
    toggle: (key: EffectKey, on: boolean) => {
      state.config.effects[key] = on;
      state.version += 1;
    },
    amount: (key: EffectKey, value: number) => {
      state.config.amounts[key] = value;
      state.version += 1;
    },
  });
}

function randomizeLook(): void {
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const presets: PresetId[] = ['NCS Circle', 'Linear Bars', 'Dual Mirror', 'Center Wave', 'Orbital', 'Hexagon', 'Digital Rain', 'Shockwave', 'Waveform', 'Vinyl', 'Lyrics', 'Halo'];
  commit(() => {
    state.config.primary = palette.primary;
    state.config.secondary = palette.secondary;
    state.config.preset = presets[Math.floor(Math.random() * presets.length)];
    state.config.bgSeed = Math.floor(Math.random() * 100000) + 1;
    state.config.bg = 'generated';
    state.config.particles = [30, 50, 70, 90][Math.floor(Math.random() * 4)];
  });
  refreshCover();
  ui.toast('New look. Undo by picking your old preset.');
}

/* ------------------------------------------------------------------ *
 * canvas interaction
 * ------------------------------------------------------------------ */

interface DragState {
  kind: 'visualizer' | 'text' | 'lyrics';
  id?: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

let drag: DragState | null = null;

function canvasPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const k = Math.min(canvas.width, canvas.height) / 1080;
  return {
    x: (event.clientX - rect.left - rect.width / 2) / ((rect.width / canvas.width) * k),
    y: (event.clientY - rect.top - rect.height / 2) / ((rect.height / canvas.height) * k),
  };
}

function designSize(): { w: number; h: number } {
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) return { w: 1920, h: 1080 };
  const k = Math.min(canvas.width, canvas.height) / 1080;
  return { w: canvas.width / k, h: canvas.height / k };
}

function hitTest(point: { x: number; y: number }): { kind: DragState['kind']; id?: string } | null {
  const { w, h } = designSize();
  const ctx = document.querySelector<HTMLCanvasElement>('#preview')?.getContext('2d');
  const config = state.config;

  for (const layer of config.text) {
    const x = ((layer.x - 50) / 100) * w;
    const y = ((layer.y - 50) / 100) * h;
    if (!ctx) continue;
    ctx.save();
    ctx.font = `${layer.bold ? 700 : 500} ${layer.size}px ${fontFamily(layer.font)}`;
    const width = ctx.measureText(layer.text).width;
    ctx.restore();
    const left = layer.align === 'left' ? x : layer.align === 'right' ? x - width : x - width / 2;
    if (point.x >= left - 12 && point.x <= left + width + 12 && Math.abs(point.y - y) < layer.size * 0.8) {
      return { kind: 'text', id: layer.id };
    }
  }

  if (config.lyrics.enabled && state.lyrics.length > 0) {
    const y = config.lyrics.pos === 'bottom' ? h * 0.5 - h * 0.19 : config.lyrics.pos === 'top' ? -h * 0.5 + h * 0.19 : 0;
    if (Math.abs(point.y - y) < config.lyrics.size * 1.1) return { kind: 'lyrics' };
  }

  const cx = ((config.posX - 50) / 100) * w;
  const cy = ((config.posY - 50) / 100) * h;
  const distance = Math.hypot(point.x - cx, point.y - cy);
  if (distance < 260 * config.scale) return { kind: 'visualizer' };
  return null;
}

/** Measured width of a layer in design pixels. */
function textWidth(layer: TextLayer): number {
  const ctx = document.querySelector<HTMLCanvasElement>('#preview')?.getContext('2d');
  if (!ctx) return 0;
  ctx.save();
  ctx.font = `${layer.bold ? 700 : 500} ${layer.size}px ${fontFamily(layer.font)}`;
  const width = ctx.measureText(layer.text).width;
  ctx.restore();
  return width;
}

/**
 * Keeps a layer's box inside the frame. The anchor means different things per
 * alignment, so the allowed range does too.
 */
function clampTextX(layer: TextLayer, percent: number): number {
  const { w } = designSize();
  const box = (textWidth(layer) / w) * 100;
  let min = 1;
  let max = 99;
  if (layer.align === 'center') {
    min = 1 + box / 2;
    max = 99 - box / 2;
  } else if (layer.align === 'left') {
    min = 1;
    max = 99 - box;
  } else {
    min = 1 + box;
    max = 99;
  }
  if (min >= max) return 50;
  return Math.max(min, Math.min(max, percent));
}

function applyDrag(point: { x: number; y: number }): void {
  const current = drag;
  if (!current) return;
  const { w, h } = designSize();
  const dx = point.x - current.startX;
  const dy = point.y - current.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
  const toPercentX = (designX: number) => Math.max(2, Math.min(98, (designX / w + 0.5) * 100));
  const toPercentY = (designY: number) => Math.max(2, Math.min(98, (designY / h + 0.5) * 100));

  if (current.kind === 'visualizer') {
    state.config.posX = toPercentX((current.originX / 100 - 0.5) * w + dx);
    state.config.posY = toPercentY((current.originY / 100 - 0.5) * h + dy);
  } else if (current.kind === 'text' && current.id) {
    const layer = state.config.text.find((entry) => entry.id === current.id);
    if (!layer) return;
    const nextX = ((current.originX / 100 - 0.5) * w + dx) / w * 100 + 50;
    layer.x = clampTextX(layer, Math.max(0, Math.min(100, nextX)));
    layer.y = toPercentY((current.originY / 100 - 0.5) * h + dy);
  }
  state.version += 1;
  syncActiveLayerControls();
}

function bindCanvas(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) return;

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.song) return;
    const point = canvasPoint(event);
    const hit = hitTest(point);
    if (!hit) return;
    canvas.setPointerCapture(event.pointerId);
    const originX = hit.kind === 'text'
      ? state.config.text.find((entry) => entry.id === hit.id)?.x ?? 50
      : state.config.posX;
    const originY = hit.kind === 'text'
      ? state.config.text.find((entry) => entry.id === hit.id)?.y ?? 50
      : state.config.posY;
    drag = { ...hit, startX: point.x, startY: point.y, originX, originY, moved: false };
    if (hit.kind === 'text' && hit.id) {
      state.activeTextId = hit.id;
      state.lastTextSig = '';
      syncChrome();
    }
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(event);
    if (drag) {
      applyDrag(point);
      return;
    }
    if (!state.song) return;
    const hit = hitTest(point);
    canvas.style.cursor = hit ? (hit.kind === 'text' ? 'move' : 'grab') : 'default';
  });

  canvas.addEventListener('pointerup', () => {
    drag = null;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('pointercancel', () => {
    drag = null;
  });

  canvas.addEventListener('wheel', (event) => {
    if (!state.song) return;
    const point = canvasPoint(event);
    const hit = hitTest(point);
    if (!hit) return;
    event.preventDefault();
    if (hit.kind === 'visualizer') {
      const step = event.deltaY > 0 ? -0.05 : 0.05;
      state.config.scale = Math.max(0.3, Math.min(2, Number((state.config.scale + step).toFixed(2))));
    } else if (hit.kind === 'text' && hit.id) {
      const layer = state.config.text.find((entry) => entry.id === hit.id);
      if (!layer) return;
      layer.size = Math.max(12, Math.min(160, layer.size + (event.deltaY > 0 ? -2 : 2)));
    } else {
      state.config.lyrics.size = Math.max(24, Math.min(96, state.config.lyrics.size + (event.deltaY > 0 ? -2 : 2)));
    }
    state.version += 1;
    syncActiveLayerControls();
  }, { passive: false });
}

/* ------------------------------------------------------------------ *
 * events
 * ------------------------------------------------------------------ */

function bindEvents(): void {
  ui.$$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => ui.setActiveTab((tab as HTMLElement).dataset.tab ?? 'presets'));
  });

  ui.$('#btnChooseAudio').addEventListener('click', () => ui.$<HTMLInputElement>('#fileAudio').click());
  ui.$('#fileAudio').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadAudio(file);
    (event.target as HTMLInputElement).value = '';
  });

  ui.$('#fileImage').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadBackgroundImage(file);
    (event.target as HTMLInputElement).value = '';
  });
  ui.$('#fileVideo').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadBackgroundVideo(file);
    (event.target as HTMLInputElement).value = '';
  });
  ui.$('#fileCover').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadCoverImage(file);
    (event.target as HTMLInputElement).value = '';
  });
  ui.$('#fileLyrics').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadLyrics(file);
    (event.target as HTMLInputElement).value = '';
  });
  ui.$('#fileLook').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadLook(file);
    (event.target as HTMLInputElement).value = '';
  });

  ui.$('#btnPlay').addEventListener('click', () => {
    if (!state.song) return;
    state.frozenTime = null;
    if (playback.playing) {
      playback.pause();
    } else {
      const at = playback.time >= state.song.duration - 0.05 ? 0 : playback.time;
      void playback.play(at);
    }
    updateTransport(playback.time, state.song.duration);
  });

  const seek = ui.$<HTMLInputElement>('#seekRange');
  seek.addEventListener('input', () => {
    if (!state.song) return;
    state.frozenTime = null;
    playback.seek((Number(seek.value) / 1000) * state.song.duration);
    ui.paintRange(seek);
    state.version += 1;
  });

  const volume = ui.$<HTMLInputElement>('#volume');
  volume.addEventListener('input', () => {
    state.volume = Number(volume.value) / 100;
    state.muted = state.volume === 0;
    playback.setVolume(state.volume);
    ui.paintRange(volume);
  });

  ui.$('#btnMute').addEventListener('click', () => {
    state.muted = !state.muted;
    playback.setVolume(state.muted ? 0 : state.volume || 1);
    ui.toast(state.muted ? 'Muted' : 'Sound on');
  });

  ui.$('#sensitivity').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    state.config.sensitivity = value;
    state.version += 1;
    const out = document.querySelector('#sensitivityOut');
    if (out) out.textContent = `${Math.round(value * 100)}%`;
  });

  ui.$('#bars').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    state.config.bars = value;
    state.version += 1;
    const out = document.querySelector('#barsOut');
    if (out) out.textContent = String(value);
  });

  ui.$('#particles').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    state.config.particles = value;
    state.version += 1;
    const out = document.querySelector('#particlesOut');
    if (out) out.textContent = String(value);
  });

  ui.$('#rangeStart').addEventListener('input', (event) => {
    state.config.rangeStart = Math.max(0, Number((event.target as HTMLInputElement).value) || 0);
    state.version += 1;
  });

  ui.$('#rangeEnd').addEventListener('input', (event) => {
    state.config.rangeEnd = Math.max(0, Number((event.target as HTMLInputElement).value) || 0);
    state.version += 1;
  });

  ui.$('#btnRangePlayhead').addEventListener('click', () => {
    if (!state.song) return;
    state.config.rangeStart = Math.round(playback.time * 10) / 10;
    state.version += 1;
    syncChrome();
    ui.toast(`Render starts at ${state.config.rangeStart.toFixed(1)} s`);
  });

  ui.$('#quality').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    state.config.quality = value;
    state.version += 1;
    const out = document.querySelector('#qualityOut');
    if (out) out.textContent = value <= 0.75 ? 'Small' : value <= 1 ? 'Balanced' : 'High';
  });

  ui.$('#dim').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    state.config.dim = value;
    state.version += 1;
    const out = document.querySelector('#dimOut');
    if (out) out.textContent = `${Math.round(value * 100)}%`;
  });

  ui.$('#scale').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    state.config.scale = value;
    state.version += 1;
    const out = document.querySelector('#scaleOut');
    if (out) out.textContent = `${Math.round(value * 100)}%`;
  });

  ui.$('#opacity').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    state.config.visualizerOpacity = value;
    state.version += 1;
    const out = document.querySelector('#opacityOut');
    if (out) out.textContent = `${Math.round(value * 100)}%`;
  });

  const bindColor = (selector: string, apply: (value: string) => void): void => {
    ui.$(selector).addEventListener('input', (event) => {
      apply((event.target as HTMLInputElement).value);
      state.version += 1;
      syncChrome();
      if (selector === '#primary' || selector === '#secondary') refreshCover();
    });
  };
  bindColor('#primary', (value) => { state.config.primary = value; });
  bindColor('#secondary', (value) => { state.config.secondary = value; });
  bindColor('#lyricColor', (value) => { state.config.lyrics.color = value; });
  bindColor('#lyricHighlight', (value) => { state.config.lyrics.highlight = value; });
  bindColor('#lyricPill', (value) => { state.config.lyrics.pill = value; });

  ui.$('#btnCover').addEventListener('click', () => ui.$<HTMLInputElement>('#fileCover').click());
  ui.$('#btnCoverLibrary').addEventListener('click', () => picker?.open('photo', 'center'));
  ui.$('#btnCoverReset').addEventListener('click', () => {
    state.customCover = null;
    state.useGeneratedArt = true;
    state.centreCredit = '';
    refreshCover();
    syncCredit();
    ui.toast('Using generated art.');
  });
  ui.$('#btnCoverDefault').addEventListener('click', () => {
    state.customCover = null;
    state.useGeneratedArt = false;
    state.centreCredit = '';
    refreshCover();
    syncCredit();
    ui.toast('Using the studio logo.');
  });

  ui.$('#btnAddText').addEventListener('click', addTextLayer);
  ui.$('#btnRandomPreset').addEventListener('click', () => {
    const ids = ['NCS Circle', 'Linear Bars', 'Dual Mirror', 'Center Wave', 'Orbital', 'Hexagon', 'Oscilloscope', 'Digital Rain', 'Shockwave', 'Minimal', 'Waveform', 'Vinyl', 'Lyrics', 'Halo'];
    const next = ids[Math.floor(Math.random() * ids.length)] as PresetId;
    commit(() => { state.config.preset = next; });
  });
  ui.$('#btnRandomize').addEventListener('click', randomizeLook);

  ui.$('#lyricsToggle').addEventListener('click', () => {
    const button = ui.$('#lyricsToggle');
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    ui.$('#lyricsBody').hidden = open;
  });

  ui.$('#btnLoadLrc').addEventListener('click', () => ui.$<HTMLInputElement>('#fileLyrics').click());
  ui.$('#btnDistribute').addEventListener('click', () => {
    const text = ui.$<HTMLTextAreaElement>('#lyricText').value;
    if (!text.trim()) {
      ui.toast('Paste some lyrics first.', 'err');
      return;
    }
    if (!state.song) {
      ui.toast('Load a song first so the lines have somewhere to land.', 'err');
      return;
    }
    applyLyricText(text);
  });

  ui.$('#lyricFont').addEventListener('change', (event) => {
    state.config.lyrics.font = (event.target as HTMLSelectElement).value;
    state.version += 1;
  });

  ui.$('#btnLyricsClear').addEventListener('click', () => {
    commit(() => {
      state.lyrics = [];
      state.config.lyrics.enabled = false;
    });
    const area = document.querySelector<HTMLTextAreaElement>('#lyricText');
    if (area) area.value = '';
    ui.toast('Lyrics removed.');
  });

  ui.$('#btnLyricsReset').addEventListener('click', () => {
    const keepEnabled = state.lyrics.length > 0;
    commit(() => {
      state.config.lyrics = { ...defaultConfig().lyrics, enabled: keepEnabled };
    });
    const fontSelect = document.querySelector<HTMLSelectElement>('#lyricFont');
    if (fontSelect) ui.buildFontSelect(fontSelect, state.config.lyrics.font);
    ui.toast('Lyric styling reset.');
  });

  ui.$('#lyricSize').addEventListener('input', (event) => {
    state.config.lyrics.size = Number((event.target as HTMLInputElement).value);
    state.version += 1;
    const out = document.querySelector('#lyricSizeOut');
    if (out) out.textContent = String(Math.round(state.config.lyrics.size));
  });

  ui.$('#lyricLines').addEventListener('input', (event) => {
    state.config.lyrics.lines = Number((event.target as HTMLInputElement).value);
    state.version += 1;
    const out = document.querySelector('#lyricLinesOut');
    if (out) out.textContent = String(state.config.lyrics.lines);
  });

  ui.$('#lyricOffset').addEventListener('input', (event) => {
    state.config.lyrics.offset = Number((event.target as HTMLInputElement).value) / 10;
    state.version += 1;
    const out = document.querySelector('#lyricOffsetOut');
    if (out) out.textContent = `${state.config.lyrics.offset.toFixed(1)} s`;
  });

  ui.$('#lyricSections').addEventListener('change', (event) => {
    state.config.lyrics.showSections = (event.target as HTMLInputElement).checked;
    state.version += 1;
  });

  ui.$('#lyricGlow').addEventListener('input', (event) => {
    state.config.lyrics.glow = Number((event.target as HTMLInputElement).value) / 100;
    const out = document.querySelector('#lyricGlowOut');
    if (out) out.textContent = `${(event.target as HTMLInputElement).value}%`;
    state.version += 1;
  });

  ui.$('#lyricPillOpacity').addEventListener('input', (event) => {
    state.config.lyrics.pillOpacity = Number((event.target as HTMLInputElement).value) / 100;
    state.version += 1;
    const out = document.querySelector('#lyricPillOpacityOut');
    if (out) out.textContent = `${Math.round(state.config.lyrics.pillOpacity * 100)}%`;
  });

  ui.$('#btnTheme').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleThemeMenu();
  });
  document.addEventListener('click', (event) => {
    const pop = document.querySelector<HTMLElement>('#themePop');
    if (!pop || pop.hidden) return;
    if (!(event.target as HTMLElement).closest('.theme-anchor')) toggleThemeMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleThemeMenu(false);
  });

  ui.$('#btnNewSong').addEventListener('click', () => void loadAnotherSong());
  ui.$('#btnResetAll').addEventListener('click', () => void resetEverything());
  ui.$('#btnRender').addEventListener('click', () => void startRender());
  ui.$('#btnCancelRender').addEventListener('click', () => abortController?.abort());
  ui.$('#btnCloseRender').addEventListener('click', closeModal);
  ui.$('#btnReveal').addEventListener('click', () => {
    const api = desktop();
    if (api && state.lastExportPath) void api.reveal(state.lastExportPath);
  });
  ui.$('#btnDownloadAgain').addEventListener('click', (event) => {
    const api = desktop();
    if (!api || !state.lastExport.blob) return;
    event.preventDefault();
    void persistBlob(state.lastExport.blob, state.lastExportName, 'video').then((saved) => {
      if (saved.saved) ui.toast(saved.path ? `Saved to ${saved.path}` : 'Saved.');
    });
  });
  ui.$('#btnExportFrame').addEventListener('click', () => void saveFrame());
  ui.$('#btnSaveLook').addEventListener('click', saveLook);
  ui.$('#btnLoadLook').addEventListener('click', () => ui.$<HTMLInputElement>('#fileLook').click());

  window.addEventListener('resize', () => {
    fitFrame();
    lastDrawKey = '';
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.body.classList.add('is-dragging');
  });
  window.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) document.body.classList.remove('is-dragging');
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    document.body.classList.remove('is-dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) void routeFile(file);
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      ui.$<HTMLButtonElement>('#btnPlay').click();
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      if (!state.song) return;
      event.preventDefault();
      state.frozenTime = null;
      playback.seek(playback.time + (event.code === 'ArrowLeft' ? -5 : 5));
      state.version += 1;
    } else if (event.code === 'Home') {
      if (!state.song) return;
      state.frozenTime = null;
      playback.seek(0);
      state.version += 1;
    } else if (event.key.toLowerCase() === 'm') {
      ui.$<HTMLButtonElement>('#btnMute').click();
    }
  });
}

async function routeFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/.test(name)) {
    await loadAudio(file);
  } else if (/\.(lrc|txt)$/.test(name)) {
    if (!state.song) {
      ui.toast('Load a song first, then drop the lyrics.', 'err');
      return;
    }
    await loadLyrics(file);
  } else if (/\.(songframe\.)?json$/.test(name)) {
    await loadLook(file);
  } else if (file.type.startsWith('video/')) {
    await loadBackgroundVideo(file);
  } else if (file.type.startsWith('image/')) {
    await loadCoverImage(file);
  } else {
    ui.toast('That file type is not supported.', 'err');
  }
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

function renderThemeMenu(): void {
  const list = document.querySelector('#themeList');
  if (!list) return;
  const active = currentThemeId();
  list.innerHTML = '';
  for (const theme of THEMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-item';
    button.dataset.theme = theme.id;
    button.innerHTML = `<span class="theme-dots"><span class="theme-dot" style="background:${theme.accent}"></span><span class="theme-dot" style="background:${theme.accent2}"></span></span><span>${theme.name}</span>`;
    if (theme.id === active) button.classList.add('is-active');
    button.addEventListener('click', () => {
      applyTheme(theme.id);
      renderThemeMenu();
      toggleThemeMenu(false);
      ui.toast(`${theme.name} theme`);
    });
    list.appendChild(button);
  }
}

function toggleThemeMenu(open?: boolean): void {
  const pop = document.querySelector<HTMLElement>('#themePop');
  const button = document.querySelector<HTMLButtonElement>('#btnTheme');
  if (!pop || !button) return;
  const next = open ?? pop.hidden;
  pop.hidden = !next;
  button.setAttribute('aria-expanded', String(next));
}

function boot(): void {
  applyTheme(currentThemeId());
  ui.buildPresetGrid((id) => commit(() => { state.config.preset = id; }));
  ui.buildSwatches(state.config.primary, (primary, secondary) => {
    commit(() => {
      state.config.primary = primary;
      state.config.secondary = secondary;
    });
    refreshCover();
  });
  rebuildFx();
  ui.decorateRanges();
  ui.buildSegments(state.config, segmentHandlers);
  bindEvents();
  bindCanvas();

  renderThemeMenu();

  // In the desktop shell this replaces the probed list with every installed family.
  void hydrateSystemFonts().then((added) => {
    if (!added) return;
    state.lastTextSig = '';
    const lyricFont = document.querySelector<HTMLSelectElement>('#lyricFont');
    if (lyricFont) ui.buildFontSelect(lyricFont, state.config.lyrics.font);
    syncChrome();
  });

  picker = createMediaPicker({
    songTitle: () => state.config.text[0]?.text ?? state.song?.name ?? '',
    paletteName: () => PALETTES.find((entry) => entry.primary.toLowerCase() === state.config.primary.toLowerCase())?.name ?? 'Custom',
    primary: () => state.config.primary,
    secondary: () => state.config.secondary,
    onPhoto: async (item: MediaItem, target: 'background' | 'center') => {
      try {
        ui.toast('Loading the picture…');
        if (target === 'center') {
          state.customCover = await loadImageUrl(await resolveFullSize(item, 900));
          state.useGeneratedArt = false;
          state.centreCredit = creditLine(item);
          state.config.showCredit = true;
          refreshCover();
          syncCredit();
          ui.toast(`Centre image set · ${item.license}`);
          return;
        }
        const picture = await loadImageUrl(await resolveFullSize(item));
        state.assets.background = picture;
        commit(() => {
          state.config.bg = 'image';
          state.backgroundCredit = creditLine(item);
          state.config.showCredit = true;
        });
        syncCredit();
        ui.toast(`Background set · ${item.license}`);
      } catch (error) {
        ui.toast(error instanceof Error ? error.message : 'That picture could not be loaded.', 'err');
      }
    },
    onVideo: async (item: MediaItem, target: 'background' | 'center') => {
      if (target === 'center') return;
      try {
        ui.toast('Loading the clip…');
        const clip = await loadVideoUrl(item.full);
        state.assets.backgroundVideo = clip;
        startBackgroundVideo();
        commit(() => {
          state.config.bg = 'video';
          state.backgroundCredit = creditLine(item);
          state.config.showCredit = true;
        });
        syncCredit();
        ui.toast(`Background clip set · ${item.license}`);
      } catch (error) {
        ui.toast(error instanceof Error ? error.message : 'That clip could not be loaded.', 'err');
      }
    },
    onPattern: (index: number) => {
      commit(() => {
        state.config.bg = 'pattern';
        state.config.pattern = index;
        state.config.credit = '';
      });
    },
    onFile: (kind: 'image' | 'video') => {
      ui.$<HTMLInputElement>(kind === 'video' ? '#fileVideo' : '#fileImage').click();
    },
  });

  refreshCover();
  fitFrame();
  syncChrome();
  requestAnimationFrame(tick);

  // The automated smoke test drives the app through this surface.
  interface SongframeApi {
    ready: boolean;
    loadAudioFile: (file: File) => Promise<{ name: string; duration: number }>;
    loadLyrics: (text: string) => void;
    setConfig: (patch: Partial<Config>) => void;
    getState: () => Config & { duration: number; preset: string };
    drawAt: (seconds: number) => void;
    getFrame: (seconds: number) => { t: number; bass: number; mid: number; treble: number; energy: number; bands: number[] } | null;
    getLyrics: () => { time: number; text: string; section: boolean; words: number }[];
    getBackground: () => { kind: string; videoPaused: boolean | null; videoTime: number | null; hasImage: boolean; hasCentreImage: boolean; cover: string };
    exportVideo: (options?: { height?: number; fps?: number; maxSeconds?: number }) => Promise<Blob>;
    lastExport: { blob: Blob | null; mime: string; bytes: number };
  }

  const api: SongframeApi = {
    ready: true,
    loadAudioFile: async (file) => {
      await loadAudio(file);
      if (!state.song) throw new Error('the song did not load');
      return { name: state.song.name, duration: state.song.duration };
    },
    loadLyrics: (text) => applyLyricText(text),
    setConfig: (patch) => {
      Object.assign(state.config, patch);
      state.version += 1;
      refreshCover();
      syncChrome();
    },
    getState: () => ({ ...state.config, duration: state.song?.duration ?? 0, preset: state.config.preset }),
    getLyrics: () => state.lyrics.map((line) => ({ time: line.time, text: line.text, section: line.isSection, words: line.words.length })),
    getBackground: () => ({
      kind: state.config.bg,
      videoPaused: state.assets.backgroundVideo ? state.assets.backgroundVideo.paused : null,
      videoTime: state.assets.backgroundVideo ? state.assets.backgroundVideo.currentTime : null,
      hasImage: Boolean(state.assets.background),
      hasCentreImage: Boolean(state.customCover),
      cover: state.customCover ? 'custom' : state.useGeneratedArt ? 'generated' : 'logo',
    }),
    drawAt: (seconds) => {
      state.frozenTime = seconds;
      fitFrame();
      drawPreview(seconds);
      lastDrawKey = String(seconds) + '|' + state.version + '|' + state.config.aspect + '|song';
    },
    getFrame: (seconds) => {
      if (!state.song) return null;
      const frame = frameAt(state.song, seconds, state.config.sensitivity);
      return {
        t: frame.t,
        bass: frame.bass,
        mid: frame.mid,
        treble: frame.treble,
        energy: frame.energy,
        bands: Array.from(frame.bands),
      };
    },
    exportVideo: async (options) => {
      if (!state.song) throw new Error('load a song first');
      const config = structuredClone(state.config);
      if (options?.height) config.height = options.height as Config['height'];
      if (options?.fps) config.fps = options.fps as Config['fps'];
      state.exporting = true;
      try {
        const result = await exportVideo({
          song: state.song,
          config,
          assets: state.assets,
          lyrics: state.lyrics,
          startAt: config.rangeStart,
          endAt: config.rangeEnd,
          maxSeconds: options?.maxSeconds,
        });
        state.lastExport = { blob: result.blob, mime: result.mime, bytes: result.blob.size };
        return result.blob;
      } finally {
        state.exporting = false;
      }
    },
    lastExport: state.lastExport,
  };
  (window as unknown as { songframe: SongframeApi }).songframe = api;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
