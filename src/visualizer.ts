import { drawCover, drawGeneratedBackground, drawPlainBackground, rgba } from './backgrounds';
import { drawLyrics } from './lyrics';
import { fontFamily } from './fonts';
import { mulberry32 } from './presets';
import type { Config, Frame, LyricLine } from './types';

export interface Assets {
  cover: HTMLImageElement | HTMLCanvasElement | null;
  background: HTMLImageElement | null;
  backgroundVideo: HTMLVideoElement | null;
}

export interface RenderOptions {
  config: Config;
  frame: Frame;
  assets: Assets;
  lyrics: LyricLine[];
  duration: number;
  /** Whole-track peaks, used by the waveform preset. */
  peaks?: Float32Array;
}

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEF';

function bandAt(bands: Float32Array, index: number, count: number): number {
  const pos = (index / count) * bands.length;
  const i = Math.min(bands.length - 1, Math.max(0, Math.floor(pos)));
  const next = Math.min(bands.length - 1, i + 1);
  const frac = pos - i;
  return bands[i] * (1 - frac) + bands[next] * frac;
}

function fontStack(id: Config['text'][number]['font']): string {
  return fontFamily(id);
}

/**
 * Draws one complete frame. The canvas may be any size: everything inside is
 * laid out in 1080-space (short side = 1080) and scaled once up front, so the
 * preview and the export are the same picture at different resolutions.
 */
export function renderFrame(ctx: CanvasRenderingContext2D, width: number, height: number, opts: RenderOptions): void {
  const { config, frame, assets, lyrics, duration, peaks } = opts;
  const k = Math.min(width, height) / 1080;
  const dw = width / k;
  const dh = height / k;
  const t = frame.t;
  const pulse = 1 + frame.bass * 0.15;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(k, 0, 0, k, width / 2, height / 2);

  drawBackground(ctx, dw, dh, t, config, assets);

  // --- preset ---
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, config.visualizerOpacity ?? 1));
  const scale = config.scale;
  const cx = ((config.posX - 50) / 100) * dw;
  const cy = ((config.posY - 50) / 100) * dh;
  ctx.translate(cx, cy);
  if (scale !== 1) ctx.scale(scale, scale);

  if (config.effects.shake && frame.bass > 0.55) {
    const magnitude = config.amounts.shake * 26 * frame.bass;
    const rnd = mulberry32(Math.floor(t * 1000) + 17);
    ctx.translate((rnd() - 0.5) * magnitude, (rnd() - 0.5) * magnitude);
  }

  switch (config.preset) {
    case 'NCS Circle':
      drawNCSCircle(ctx, frame, config);
      break;
    case 'Linear Bars':
      drawLinearBars(ctx, frame, config, dw, dh);
      break;
    case 'Dual Mirror':
      drawDualMirror(ctx, frame, config, dw, dh);
      break;
    case 'Center Wave':
      drawCenterWave(ctx, frame, config);
      break;
    case 'Orbital':
      drawOrbital(ctx, frame, config);
      break;
    case 'Hexagon':
      drawHexagon(ctx, frame, config);
      break;
    case 'Oscilloscope':
      drawOscilloscope(ctx, frame, config, dw, dh);
      break;
    case 'Digital Rain':
      drawDigitalRain(ctx, frame, config, dw, dh);
      break;
    case 'Shockwave':
      drawShockwave(ctx, frame, config);
      break;
    case 'Minimal':
      drawMinimal(ctx, frame, config, dw, dh, duration);
      break;
    case 'Waveform':
      drawWaveform(ctx, frame, config, dw, dh, peaks, duration);
      break;
    case 'Vinyl':
      drawVinyl(ctx, frame, config, duration, assets);
      break;
    case 'Lyrics':
      drawLyricsPreset(ctx, frame, config, dw, dh);
      break;
  }

  // The lyrics layout is type-only: particles read as stray dots around the words.
  if (config.preset !== 'Lyrics') drawParticles(ctx, frame, config, dw, dh);

  if (config.preset === 'NCS Circle' || config.preset === 'Hexagon' || config.preset === 'Orbital' || config.preset === 'Shockwave') {
    drawCenterArt(ctx, pulse, config, assets);
  }
  ctx.restore();

  // --- text layers ---
  for (const layer of config.text) {
    if (!layer.text.trim()) continue;
    const size = layer.id === 'title' && config.preset === 'Minimal' ? layer.size * pulse : layer.size;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.fillStyle = layer.color;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.max(6, size * 0.22);
    ctx.textAlign = layer.align;
    ctx.textBaseline = 'middle';
    ctx.font = `${layer.bold ? 700 : 500} ${size}px ${fontStack(layer.font)}`;
    const x = ((layer.x - 50) / 100) * dw;
    const y = ((layer.y - 50) / 100) * dh;
    ctx.fillText(layer.text, x, y);
    ctx.restore();
  }

  drawLyrics(ctx, { cfg: config.lyrics, lines: lyrics, time: t, width: dw, height: dh });

  if (config.showCredit && config.credit.trim()) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 19px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 8;
    ctx.fillText(config.credit, dw / 2 - 26, dh / 2 - 22);
    ctx.restore();
  }

  applyEffects(ctx, width, height, k, config, frame);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  dw: number,
  dh: number,
  t: number,
  config: Config,
  assets: Assets,
): void {
  const dim = config.dim;
  const source =
    config.bg === 'video' && assets.backgroundVideo
      ? assets.backgroundVideo
      : config.bg === 'image' && assets.background
        ? assets.background
        : null;

  if (config.bg === 'generated' || config.bg === 'pattern') {
    ctx.save();
    const zoom = 1.06 + Math.sin(t * 0.11) * 0.045;
    ctx.scale(zoom, zoom);
    const archetype = config.bg === 'pattern' ? config.pattern : undefined;
    drawGeneratedBackground(ctx, dw, dh, t, config.bgSeed, config.primary, config.secondary, archetype);
    ctx.restore();
  } else if (source) {
    ctx.save();
    const zoom = 1.06 + Math.sin(t * 0.18) * 0.035;
    ctx.scale(zoom, zoom);
    drawCover(ctx, source, 0, 0, dw, dh);
    ctx.restore();
  } else {
    drawPlainBackground(ctx, dw, dh, config.primary, config.secondary);
  }

  if (dim > 0.001) {
    ctx.fillStyle = rgba('#000000', dim);
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
  }
}

function drawNCSCircle(ctx: CanvasRenderingContext2D, frame: Frame, config: Config): void {
  const radius = 150 + frame.bass * 8;
  const bars = Math.max(8, Math.min(160, Math.round(config.bars)));
  const step = (Math.PI * 2) / bars;
  const gradient = ctx.createLinearGradient(0, radius, 0, radius + 150);
  gradient.addColorStop(0, config.primary);
  gradient.addColorStop(1, config.secondary);

  ctx.save();
  ctx.rotate(frame.t * 0.15);
  for (let i = 0; i < bars; i++) {
    const value = bandAt(frame.bands, i, bars);
    const barHeight = 10 + Math.pow(value, 1.5) * 130;
    ctx.save();
    ctx.rotate(i * step);
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 14;
    ctx.shadowColor = rgba(config.primary, 0.55);
    ctx.beginPath();
    ctx.roundRect(-3.5, radius + 12, 7, barHeight, 3.5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba('#ffffff', 0.16);
    ctx.beginPath();
    ctx.roundRect(-3.5, radius + 12 + barHeight + 4, 7, 4, 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius + 168, 0, Math.PI * 2);
  ctx.strokeStyle = rgba('#ffffff', 0.08);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawLinearBars(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number): void {
  // Everything here multiplies the incoming alpha, so the opacity slider keeps
  // working instead of being reset by the reflection pass.
  const base = ctx.globalAlpha;
  const bars = Math.max(8, Math.min(160, Math.round(config.bars)));
  const barWidth = dw / bars;
  const gap = Math.max(2, barWidth * 0.18);
  const maxHeight = dh * 0.3;
  const gradient = ctx.createLinearGradient(0, -maxHeight, 0, 0);
  gradient.addColorStop(0, config.secondary);
  gradient.addColorStop(1, config.primary);

  for (let i = 0; i < bars; i++) {
    const value = bandAt(frame.bands, i, bars);
    const barHeight = 8 + Math.pow(value, 1.3) * maxHeight;
    const x = -dw / 2 + i * barWidth + gap / 2;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, -barHeight, barWidth - gap, barHeight);
    ctx.globalAlpha = base * 0.22;
    ctx.fillRect(x, 0, barWidth - gap, barHeight * 0.55);
    ctx.globalAlpha = base;
  }

  ctx.fillStyle = rgba('#ffffff', 0.25);
  ctx.fillRect(-dw / 2, -1, dw, 2);
}

function drawDualMirror(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number): void {
  const base = ctx.globalAlpha;
  const rows = Math.max(6, Math.min(120, Math.round(config.bars)));
  const rowHeight = dh / rows;
  for (let i = 0; i < rows; i++) {
    const value = bandAt(frame.bands, i, rows);
    const length = 14 + Math.pow(value, 1.4) * (dw * 0.28);
    const alpha = 0.3 + value * 0.7;
    const y = -dh / 2 + i * rowHeight;
    ctx.globalAlpha = base * alpha;
    ctx.fillStyle = i % 2 === 0 ? config.primary : config.secondary;
    const thickness = Math.max(2, rowHeight - 4);
    ctx.fillRect(-dw / 2, y, length, thickness);
    ctx.fillRect(dw / 2 - length, y, length, thickness);
  }
  ctx.globalAlpha = base;
}

function drawCenterWave(ctx: CanvasRenderingContext2D, frame: Frame, config: Config): void {
  const base = ctx.globalAlpha;
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const value = bandAt(frame.bands, i * 4, 48);
    const radius = 62 + i * 34 + Math.pow(value, 1.4) * 26;
    ctx.beginPath();
    ctx.strokeStyle = i % 2 === 0 ? config.primary : config.secondary;
    ctx.globalAlpha = base * Math.max(0.12, 0.85 - i * 0.06);
    ctx.lineWidth = 3;
    ctx.shadowBlur = 16;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.ellipse(0, 0, radius, radius * 0.76, frame.t * 0.35 + i * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrbital(ctx: CanvasRenderingContext2D, frame: Frame, config: Config): void {
  const base = ctx.globalAlpha;
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const value = bandAt(frame.bands, i * 8, 40);
    const radius = 100 + i * 55;
    const direction = i % 2 === 0 ? 1 : -1;
    const start = frame.t * direction * (0.45 + i * 0.09);
    const arc = Math.PI * 1.15 + value * Math.PI * 0.45;
    ctx.beginPath();
    ctx.strokeStyle = i % 2 === 0 ? config.primary : config.secondary;
    ctx.globalAlpha = base * 0.85;
    ctx.lineWidth = 4 + value * 7;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 24;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.arc(0, 0, radius, start, start + arc);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHexagon(ctx: CanvasRenderingContext2D, frame: Frame, config: Config): void {
  const base = ctx.globalAlpha;
  const pulse = 1 + frame.bass * 0.15;
  ctx.save();
  ctx.rotate(frame.t * 0.35);
  const draw = (radius: number, width: number, color: string, alpha: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = base * alpha;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.shadowBlur = 26;
    ctx.shadowColor = color;
    ctx.stroke();
  };
  draw(180 * pulse, 12, config.primary, 1);
  ctx.rotate(-frame.t * 0.8);
  draw(180 * 0.72 * pulse, 5, config.secondary, 0.8);
  ctx.globalAlpha = base;
  ctx.shadowBlur = 0;
  ctx.restore();

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 + frame.t * 0.35;
    const value = bandAt(frame.bands, i * 10, 60);
    const radius = 180 * pulse + 26 + value * 34;
    ctx.beginPath();
    ctx.fillStyle = config.secondary;
    ctx.shadowBlur = 18;
    ctx.shadowColor = config.secondary;
    ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 3 + value * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawOscilloscope(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number): void {
  const width = dw * 0.84;
  const amplitude = dh * 0.3;
  ctx.save();
  ctx.strokeStyle = config.primary;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 20;
  ctx.shadowColor = config.primary;
  ctx.beginPath();
  const stepX = width / (frame.wave.length - 1);
  for (let i = 0; i < frame.wave.length; i++) {
    const x = -width / 2 + i * stepX;
    const y = -frame.wave[i] * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba('#ffffff', 0.12);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(width / 2, 0);
  ctx.stroke();
  ctx.restore();
}

function drawDigitalRain(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number): void {
  const base = ctx.globalAlpha;
  const columns = Math.max(12, Math.min(96, Math.round(config.bars)));
  const columnWidth = dw / columns;
  const rowHeight = 22;
  const bucket = Math.floor(frame.t * 10);
  ctx.save();
  ctx.font = '600 17px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 9;
  ctx.shadowColor = config.primary;

  for (let c = 0; c < columns; c++) {
    const value = bandAt(frame.bands, c, columns);
    const length = 9 + Math.floor(Math.pow(value, 1.1) * 18);
    const speed = 34 + ((c * 7) % 5) * 13;
    const span = dh + length * rowHeight;
    const offset = ((frame.t * speed + c * 53) % span) - dh / 2 - length * rowHeight;
    const x = -dw / 2 + c * columnWidth + columnWidth / 2;
    for (let r = 0; r < length; r++) {
      const y = offset + r * rowHeight;
      if (y < -dh / 2 - rowHeight || y > dh / 2 + rowHeight) continue;
      const fade = 1 - r / length;
      // A cheap hash keeps every glyph independent instead of repeating a
      // short sequence down the column.
      const noise = Math.abs(Math.sin(c * 127.1 + r * 311.7 + bucket * 74.7) * 43758.5453) % 1;
      const glyph = GLYPHS[Math.floor(noise * GLYPHS.length) % GLYPHS.length];
      ctx.globalAlpha = base * Math.max(0.04, fade * 0.85);
      ctx.fillStyle = r === 0 ? '#ffffff' : config.primary;
      ctx.fillText(glyph, x, y);
    }
  }
  ctx.globalAlpha = base;
  ctx.shadowBlur = 0;
  ctx.restore();
}
function drawShockwave(ctx: CanvasRenderingContext2D, frame: Frame, config: Config): void {
  const base = ctx.globalAlpha;
  const rings = 6;
  ctx.save();
  for (let i = 0; i < rings; i++) {
    const phase = (frame.t * 0.55 + i * 0.36) % 2;
    const progress = phase / 2;
    const radius = 55 + progress * 470;
    const alpha = (1 - progress) * (0.45 + frame.bass * 0.55);
    if (alpha < 0.04) continue;
    ctx.beginPath();
    ctx.strokeStyle = config.primary;
    ctx.globalAlpha = base * alpha;
    ctx.lineWidth = Math.max(1, (1 - progress) * (7 + frame.bass * 12));
    ctx.shadowBlur = 22 + frame.bass * 26;
    ctx.shadowColor = config.primary;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  const coreSize = 34 + frame.bass * 46;
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
  core.addColorStop(0, rgba(config.primary, 0.95));
  core.addColorStop(0.55, rgba(config.primary, 0.35));
  core.addColorStop(1, rgba(config.primary, 0));
  ctx.globalAlpha = base * (0.75 + frame.bass * 0.25);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = base;
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawMinimal(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number, duration: number): void {
  const width = dw * 0.9;
  const baseY = dh / 2 - dh * 0.055;
  ctx.save();
  ctx.strokeStyle = rgba('#ffffff', 0.28);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const stepX = width / (frame.wave.length - 1);
  for (let i = 0; i < frame.wave.length; i++) {
    const x = -width / 2 + i * stepX;
    const y = baseY - frame.wave[i] * 34 - 34;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const progress = duration > 0 ? Math.min(1, frame.t / duration) : 0;
  ctx.fillStyle = rgba('#ffffff', 0.12);
  ctx.fillRect(-dw / 2 + dw * 0.05, dh / 2 - dh * 0.02, width, 3);
  ctx.fillStyle = config.primary;
  ctx.fillRect(-dw / 2 + dw * 0.05, dh / 2 - dh * 0.02, width * progress, 3);
  ctx.restore();
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  config: Config,
  dw: number,
  dh: number,
  peaks: Float32Array | undefined,
  duration: number,
): void {
  const width = dw * 0.86;
  const half = dh * 0.115;
  const bars = Math.max(48, Math.min(240, Math.round(config.bars * 3)));
  const step = width / bars;
  const base = ctx.globalAlpha;
  const progress = duration > 0 ? Math.max(0, Math.min(1, frame.t / duration)) : 0;
  const gradient = ctx.createLinearGradient(0, -half, 0, half);
  gradient.addColorStop(0, config.secondary);
  gradient.addColorStop(0.5, config.primary);
  gradient.addColorStop(1, config.secondary);

  for (let i = 0; i < bars; i++) {
    let value: number;
    if (peaks && peaks.length > 0) {
      const from = Math.floor((i / bars) * peaks.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * peaks.length));
      let peak = 0;
      for (let k = from; k < to && k < peaks.length; k++) if (peaks[k] > peak) peak = peaks[k];
      value = Math.pow(peak, 0.85);
    } else {
      value = Math.abs(frame.wave[Math.floor((i / bars) * frame.wave.length)]);
    }
    const height = Math.max(2, value * half * 2);
    const played = i / bars <= progress;
    ctx.globalAlpha = base * (played ? 1 : 0.26);
    ctx.fillStyle = gradient;
    const x = -width / 2 + i * step;
    const radius = Math.min(step * 0.34, 3.5);
    ctx.beginPath();
    ctx.roundRect(x, -height / 2, Math.max(1.5, step * 0.66), height, radius);
    ctx.fill();
  }

  ctx.globalAlpha = base;
  const x = -width / 2 + width * progress;
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, -half - 10, 2, half * 2 + 20);
  ctx.restore();
}

function drawVinyl(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  config: Config,
  duration: number,
  assets: Assets,
): void {
  const radius = 178;
  const label = 86;
  const progress = duration > 0 ? Math.max(0, Math.min(1, frame.t / duration)) : 0;
  const spin = frame.t * 0.55;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 18;

  const disc = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
  disc.addColorStop(0, '#15151b');
  disc.addColorStop(0.7, '#0b0b0f');
  disc.addColorStop(1, '#050507');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.rotate(spin);
  for (let i = 0; i < 14; i++) {
    const r = label + 12 + i * ((radius - label - 16) / 14);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.055 - i * 0.002})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, label, 0, Math.PI * 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  if (assets.cover) {
    drawCover(ctx, assets.cover, 0, 0, label * 2, label * 2);
  } else {
    const fill = ctx.createLinearGradient(-label, -label, label, label);
    fill.addColorStop(0, config.primary);
    fill.addColorStop(1, config.secondary);
    ctx.fillStyle = fill;
    ctx.fillRect(-label, -label, label * 2, label * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, label, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#06060a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Progress ring outside the disc.
  const ring = radius + 20;
  ctx.beginPath();
  ctx.arc(0, 0, ring, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  ctx.stroke();
  if (progress > 0.001) {
    ctx.beginPath();
    ctx.arc(0, 0, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = config.primary;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.shadowColor = config.primary;
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawLyricsPreset(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number): void {
  const pulse = 0.5 + frame.bass * 0.5;
  const wash = ctx.createLinearGradient(-dw / 2, -dh / 2, dw / 2, dh / 2);
  wash.addColorStop(0, rgba(config.secondary, 0.06));
  wash.addColorStop(0.5, rgba('#000000', 0));
  wash.addColorStop(1, rgba(config.primary, 0.05));
  ctx.fillStyle = wash;
  ctx.fillRect(-dw / 2, -dh / 2, dw, dh);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, dh * (0.4 + pulse * 0.16));
  glow.addColorStop(0, rgba(config.primary, 0.18 + frame.bass * 0.16));
  glow.addColorStop(0.55, rgba(config.secondary, 0.07));
  glow.addColorStop(1, rgba('#000000', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
}

function drawParticles(ctx: CanvasRenderingContext2D, frame: Frame, config: Config, dw: number, dh: number): void {
  const base = ctx.globalAlpha;
  const count = config.particles;
  if (count <= 0) return;
  const t = frame.t;
  const bass = frame.bass;
  ctx.save();
  ctx.shadowColor = config.primary;

  const rising = Math.floor(count * 0.4);
  for (let i = 0; i < rising; i++) {
    const seed = i * 127.1;
    const xBase = ((Math.sin(seed) * 10000) % dw + dw) % dw - dw / 2;
    const x = xBase + Math.sin(t * 1.6 + seed) * 26;
    const speed = 18 + (i % 7) * 13;
    const y = dh / 2 - ((t * speed + seed * 9) % (dh + 120));
    const size = 1.6 + (i % 4) * 0.8 + bass * 2.4;
    ctx.globalAlpha = base * (0.35 + Math.sin(t * 6 + seed) * 0.25) * 0.8;
    ctx.fillStyle = config.primary;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const burst = Math.floor(count * 0.35);
  for (let i = 0; i < burst; i++) {
    const angle = (i / burst) * Math.PI * 2 + t * 0.28;
    const phase = (t * 0.9 + i * 0.13) % 3;
    const progress = phase / 3;
    const distance = progress * (280 + bass * 210);
    const size = (1 - progress) * (2.6 + bass * 4);
    if (size < 0.5) continue;
    ctx.globalAlpha = base * (1 - progress) * (0.5 + bass * 0.5);
    ctx.fillStyle = config.primary;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const orbital = Math.floor(count * 0.15);
  for (let i = 0; i < orbital; i++) {
    const radius = 150 + (i % 4) * 74 + bass * 44;
    const speed = (i % 2 === 0 ? 1 : -1) * (0.55 + (i % 3) * 0.22);
    const angle = t * speed + (i / Math.max(1, orbital)) * Math.PI * 2;
    const sparkle = 0.5 + Math.sin(t * 9 + i * 4) * 0.5;
    ctx.globalAlpha = base * sparkle * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = config.primary;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 1.6 + sparkle * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const dust = Math.floor(count * 0.1);
  for (let i = 0; i < dust; i++) {
    const seed = i * 567.8;
    const x = ((Math.sin(seed) * 10000) % dw + dw) % dw - dw / 2;
    const y = ((Math.cos(seed) * 10000) % dh + dh) % dh - dh / 2;
    ctx.globalAlpha = base * (0.14 + bass * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t + seed) * 8, y, 0.9 + Math.sin(t * 2 + seed) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = base;
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCenterArt(ctx: CanvasRenderingContext2D, pulse: number, config: Config, assets: Assets): void {
  const art = assets.cover;
  ctx.save();
  ctx.scale(pulse, pulse);
  ctx.shadowBlur = 42;
  ctx.shadowColor = config.primary;
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#0b0b10';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.clip();
  if (art) {
    drawCover(ctx, art, 0, 0, 300, 300);
  } else {
    const gradient = ctx.createLinearGradient(-150, -150, 150, 150);
    gradient.addColorStop(0, config.primary);
    gradient.addColorStop(1, config.secondary);
    ctx.fillStyle = gradient;
    ctx.fillRect(-150, -150, 300, 300);
  }
  ctx.restore();
}

function applyEffects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  k: number,
  config: Config,
  frame: Frame,
): void {
  const { effects, amounts } = config;
  const seed = Math.floor(frame.t * 60);
  const rnd = mulberry32(seed * 2654435761);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (effects.pixelate) {
    const size = Math.max(4, Math.round(14 * amounts.pixelate));
    const small = document.createElement('canvas');
    small.width = Math.max(2, Math.floor(width / size));
    small.height = Math.max(2, Math.floor(height / size));
    const smallCtx = small.getContext('2d');
    if (smallCtx) {
      smallCtx.drawImage(ctx.canvas, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
    }
  }

  if (effects.scanlines) {
    ctx.fillStyle = `rgba(0,0,0,${(amounts.scanlines * 0.65).toFixed(3)})`;
    const step = Math.max(3, Math.round(4 * k));
    for (let y = 0; y < height; y += step) ctx.fillRect(0, y, width, Math.max(1, Math.round(step / 2)));
  }

  if (effects.cctv) {
    const strength = amounts.cctv;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(150, 205, 165, ${(0.5 * strength).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
    const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.hypot(width, height) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(0.95 * strength).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = `rgba(0,0,0,${(0.16 * strength).toFixed(3)})`;
    const step = Math.max(3, Math.round(4 * k));
    for (let y = 0; y < height; y += step) ctx.fillRect(0, y, width, Math.max(1, Math.round(step / 2)));

    const fontSize = Math.round(width * 0.02);
    ctx.font = `600 ${fontSize}px Consolas, monospace`;
    ctx.fillStyle = 'rgba(235,255,235,0.82)';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const now = new Date(Date.now() + frame.t * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    ctx.fillText(stamp, fontSize, fontSize);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,70,70,0.92)';
    ctx.fillText('REC ●', width - fontSize, fontSize);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }
  if (effects.chromatic || effects.vhs) {
    const strength = effects.vhs ? amounts.vhs : amounts.chromatic;
    const offset = Math.round((6 + frame.bass * 18) * strength * k);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,0,80,${0.16 * strength})`;
    ctx.fillRect(-offset, 0, width, height);
    ctx.fillStyle = `rgba(0,90,255,${0.16 * strength})`;
    ctx.fillRect(offset, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (effects.vhs) {
    const strength = amounts.vhs;
    const bandHeight = Math.max(6, Math.round(24 * k));
    for (let i = 0; i < 3; i++) {
      const y = rnd() * height;
      const shift = (rnd() - 0.5) * 40 * strength * k;
      ctx.drawImage(ctx.canvas, 0, y, width, bandHeight, shift, y, width, bandHeight);
    }
    ctx.fillStyle = `rgba(255,255,255,${0.05 * strength})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (effects.glitch && frame.bass > 0.35) {
    const strength = amounts.glitch * (frame.bass + 0.25);
    const slices = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < slices; i++) {
      const sliceHeight = Math.max(4, Math.round(rnd() * 60 * k));
      const y = rnd() * height;
      const shift = (rnd() - 0.5) * 120 * strength * k;
      ctx.drawImage(ctx.canvas, 0, y, width, sliceHeight, shift, y, width, sliceHeight);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rnd() > 0.5 ? rgba(config.primary, 0.14 * strength) : 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (effects.bloom) {
    const strength = amounts.bloom;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.32 * strength;
    ctx.filter = `blur(${Math.max(2, 14 * strength * k)}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  if (effects.grain) {
    const strength = amounts.grain;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const amount = strength * 46;
    for (let i = 0; i < data.length; i += 16) {
      const noise = (rnd() - 0.5) * amount;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }
    ctx.putImageData(image, 0, 0);
  }

  if (effects.strobe && frame.bass > 0.55) {
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,255,255,${(amounts.strobe * (frame.bass - 0.45) * 1.4).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (effects.vignette) {
    const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.hypot(width, height) * 0.55);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.85 * amounts.vignette})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  if (effects.hue) {
    const degrees = amounts.hue * 140 + frame.bass * 40;
    ctx.filter = `hue-rotate(${degrees.toFixed(1)}deg)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
  }

  if (effects.letterbox) {
    const bar = height * 0.11 * amounts.letterbox;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, bar);
    ctx.fillRect(0, height - bar, width, bar);
  }

  // Effects are applied in device pixels; restore design space for the caller.
  ctx.setTransform(k, 0, 0, k, width / 2, height / 2);
}
