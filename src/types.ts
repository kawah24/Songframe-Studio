export type PresetId =
  | 'NCS Circle'
  | 'Linear Bars'
  | 'Dual Mirror'
  | 'Center Wave'
  | 'Orbital'
  | 'Hexagon'
  | 'Oscilloscope'
  | 'Digital Rain'
  | 'Shockwave'
  | 'Minimal'
  | 'Waveform'
  | 'Vinyl'
  | 'Lyrics';

export type Aspect = '16:9' | '9:16' | '1:1';
export type BgKind = 'generated' | 'pattern' | 'image' | 'video' | 'none';
export type LyricsStyle = 'karaoke' | 'lines' | 'scroll';
export type LyricsPos = 'bottom' | 'center' | 'top';
export type FontId = string;
export type Align = 'left' | 'center' | 'right';

export type EffectKey =
  | 'shake'
  | 'glitch'
  | 'vhs'
  | 'cctv'
  | 'scanlines'
  | 'chromatic'
  | 'bloom'
  | 'grain'
  | 'pixelate'
  | 'strobe'
  | 'vignette'
  | 'hue'
  | 'letterbox';

export interface TextLayer {
  id: string;
  text: string;
  /** Percent of frame width, 0-100. */
  x: number;
  /** Percent of frame height, 0-100. */
  y: number;
  /** Design-space pixels (frame short side is 1080). */
  size: number;
  color: string;
  font: FontId;
  bold: boolean;
  opacity: number;
  align: Align;
}

export interface LyricsConfig {
  enabled: boolean;
  style: LyricsStyle;
  pos: LyricsPos;
  size: number;
  lines: number;
  showSections: boolean;
  color: string;
  highlight: string;
  pill: string;
  pillOpacity: number;
  offset: number;
}

export interface Config {
  preset: PresetId;
  primary: string;
  secondary: string;
  aspect: Aspect;
  /** Render range in seconds; 0 / 0 means the whole song. */
  rangeStart: number;
  rangeEnd: number;
  /** Short side of the exported picture, in pixels. */
  height: 1080 | 720 | 480;
  fps: 24 | 30 | 60;
  audioKbps: 128 | 192 | 256 | 320;
  /** Multiplier on the size-derived video bitrate. */
  quality: number;
  bg: BgKind;
  bgSeed: number;
  /** Index into the built-in pattern library. */
  pattern: number;
  /** Attribution line burned into the frame when a library picture is used. */
  credit: string;
  showCredit: boolean;
  /** 0..1 — how much the background is dimmed. */
  dim: number;
  /** 0.5..2 — gain applied to the analysed spectrum before drawing. */
  sensitivity: number;
  /** How many bars, rows or columns the element-based presets draw. */
  bars: number;
  /** 0..1 — opacity of the visualizer group (preset, particles, centre art). */
  visualizerOpacity: number;
  scale: number;
  posX: number;
  posY: number;
  particles: number;
  effects: Record<EffectKey, boolean>;
  amounts: Record<EffectKey, number>;
  text: TextLayer[];
  lyrics: LyricsConfig;
}

/** One analysed instant of the song. Shared by preview and export. */
export interface Frame {
  t: number;
  /** 96 log-spaced bands, 0..1. */
  bands: Float32Array;
  /** 1024 time-domain samples, -1..1. */
  wave: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
}

export interface LyricLine {
  time: number;
  text: string;
  isSection: boolean;
  /** Word timings for karaoke sweeps, absolute seconds. */
  words: { time: number; text: string }[];
  /** Index into the flattened word stream, used by the distributor. */
  weight: number;
}

export interface FontSpec {
  id: FontId;
  stack: string;
}

export interface PalettePreset {
  name: string;
  primary: string;
  secondary: string;
}
