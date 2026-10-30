import type { Config, EffectKey, PalettePreset, PresetId } from './types';

export const PALETTES: PalettePreset[] = [
  { name: 'Neon Pink', primary: '#ec4899', secondary: '#8b5cf6' },
  { name: 'Cyber Blue', primary: '#06b6d4', secondary: '#3b82f6' },
  { name: 'Sunset', primary: '#f97316', secondary: '#eab308' },
  { name: 'Matrix', primary: '#22c55e', secondary: '#10b981' },
  { name: 'Fire', primary: '#ef4444', secondary: '#f97316' },
  { name: 'Ocean', primary: '#0ea5e9', secondary: '#06b6d4' },
  { name: 'Violet', primary: '#a855f7', secondary: '#ec4899' },
  { name: 'Gold', primary: '#eab308', secondary: '#f59e0b' },
  { name: 'Ice', primary: '#67e8f9', secondary: '#a5f3fc' },
  { name: 'Mono', primary: '#ffffff', secondary: '#a1a1aa' },
];

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'NCS Circle', label: 'Classic NCS', hint: 'Radial bars around the cover' },
  { id: 'Linear Bars', label: 'Spectrum', hint: 'Mirrored frequency bars' },
  { id: 'Dual Mirror', label: 'Mirror', hint: 'Horizontal bars from both edges' },
  { id: 'Center Wave', label: 'Shockwave', hint: 'Concentric rippling ellipses' },
  { id: 'Orbital', label: 'Orbital', hint: 'Rotating glowing arcs' },
  { id: 'Hexagon', label: 'Hex Core', hint: 'Pulsing hexagon rings' },
  { id: 'Oscilloscope', label: 'Analog', hint: 'Waveform oscilloscope' },
  { id: 'Digital Rain', label: 'Matrix', hint: 'Falling glyph columns' },
  { id: 'Shockwave', label: 'Pulse', hint: 'Rings that fire on the beat' },
  { id: 'Minimal', label: 'Clean', hint: 'Type, backdrop, nothing else' },
  { id: 'Waveform', label: 'Waveform', hint: 'Whole-track waveform with a playhead' },
  { id: 'Vinyl', label: 'Vinyl', hint: 'Spinning record with a progress ring' },
  { id: 'Lyrics', label: 'Lyrics', hint: 'Type-only layout for lyric videos' },
  { id: 'Halo', label: 'Halo', hint: 'Rainbow spectrum ring in perspective' },
];

export const EFFECTS: { key: EffectKey; label: string; hint: string }[] = [
  { key: 'shake', label: 'Shake', hint: 'Camera jolt on bass hits' },
  { key: 'glitch', label: 'Glitch', hint: 'Random slice tears and colour flash' },
  { key: 'vhs', label: 'VHS', hint: 'Tape wobble, colour bleed and scan noise' },
  { key: 'cctv', label: 'CCTV', hint: 'Security-camera tint, vignette and REC stamp' },
  { key: 'scanlines', label: 'Scanlines', hint: 'CRT line pattern' },
  { key: 'chromatic', label: 'Chromatic', hint: 'Red/blue separation' },
  { key: 'bloom', label: 'Bloom', hint: 'Soft glow over highlights' },
  { key: 'grain', label: 'Film grain', hint: 'Animated photographic noise' },
  { key: 'pixelate', label: 'Pixelate', hint: 'Chunky low-resolution mosaic' },
  { key: 'strobe', label: 'Strobe', hint: 'White flash on kicks' },
  { key: 'vignette', label: 'Vignette', hint: 'Darkened corners' },
  { key: 'hue', label: 'Hue shift', hint: 'Rotating colour wheel' },
  { key: 'letterbox', label: 'Letterbox', hint: 'Cinematic black bars' },
  { key: 'zoom', label: 'Kick zoom', hint: 'Frame punches in on bass hits' },
  { key: 'kaleidoscope', label: 'Kaleidoscope', hint: 'Mirrored symmetry' },
  { key: 'leak', label: 'Light leak', hint: 'Warm flare washed across the frame' },
];

export const ASPECTS: { id: Config['aspect']; w: number; h: number; label: string }[] = [
  { id: '16:9', w: 1920, h: 1080, label: '1920 x 1080' },
  { id: '9:16', w: 1080, h: 1920, label: '1080 x 1920' },
  { id: '1:1', w: 1080, h: 1080, label: '1080 x 1080' },
];

export const OUTPUT_HEIGHTS = [1080, 720, 480] as const;
export const FRAME_RATES = [24, 30, 60] as const;
export const AUDIO_BITRATES = [128, 192, 256, 320] as const;

const effectDefaults: Record<EffectKey, boolean> = {
  shake: true,
  glitch: false,
  vhs: false,
  cctv: false,
  scanlines: false,
  chromatic: false,
  bloom: false,
  grain: false,
  pixelate: false,
  strobe: false,
  vignette: false,
  hue: false,
  letterbox: false,
  zoom: false,
  kaleidoscope: false,
  leak: false,
};

const amountDefaults: Record<EffectKey, number> = {
  shake: 0.25,
  zoom: 0.5,
  kaleidoscope: 0.4,
  leak: 0.45,
  glitch: 0.3,
  vhs: 0.5,
  cctv: 0.8,
  scanlines: 0.4,
  chromatic: 0.5,
  bloom: 0.5,
  grain: 0.3,
  pixelate: 0.3,
  strobe: 0.5,
  vignette: 0.5,
  hue: 0.5,
  letterbox: 0.5,
};

export const defaultConfig = (): Config => ({
  preset: 'NCS Circle',
  primary: '#ec4899',
  secondary: '#8b5cf6',
  rangeStart: 0,
  rangeEnd: 0,
  aspect: '16:9',
  height: 1080,
  fps: 30,
  audioKbps: 192,
  quality: 1,
  bg: 'generated',
  bgSeed: 1,
  pattern: 0,
  credit: '',
  showCredit: true,
  dim: 0.45,
  sensitivity: 1,
  bars: 64,
  visualizerOpacity: 1,
  scale: 1,
  posX: 50,
  posY: 50,
  particles: 50,
  effects: { ...effectDefaults },
  amounts: { ...amountDefaults },
  text: [
    { id: 'title', text: 'Untitled', x: 50, y: 73, size: 64, color: '#ffffff', font: 'Segoe UI', bold: true, opacity: 1, align: 'center' },
    { id: 'subtitle', text: 'Songframe Studio', x: 50, y: 79, size: 28, color: '#a1a1aa', font: 'Segoe UI', bold: false, opacity: 1, align: 'center' },
  ],
  lyrics: {
    enabled: false,
    font: 'Segoe UI',
    glow: 0,
    style: 'karaoke',
    pos: 'bottom',
    size: 46,
    lines: 2,
    showSections: false,
    color: '#ffffff',
    highlight: '#ec4899',
    pill: '#000000',
    pillOpacity: 0.5,
    offset: 0,
  },
});

/** Deterministic 32-bit hash, used for seeds derived from a file name. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slugify(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'song'
  );
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
