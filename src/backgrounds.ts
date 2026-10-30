import { mulberry32 } from './presets';

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full.slice(0, 6) || '000000', 16);
  if (Number.isNaN(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function mix(hexA: string, hexB: string, amount: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, amount));
  const c = a.map((value, i) => Math.round(value + (b[i] - value) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Draws `img` so it covers the box without stretching, centred on (cx, cy). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  cx: number,
  cy: number,
  width: number,
  height: number,
): void {
  const source = img as HTMLImageElement & HTMLVideoElement;
  const w = source.naturalWidth || source.videoWidth || width;
  const h = source.naturalHeight || source.videoHeight || height;
  const scale = Math.max(width / w, height / h);
  const drawW = w * scale;
  const drawH = h * scale;
  ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

/**
 * A generated backdrop, drawn in 1080-space with the frame centred on (0,0).
 * Four seeded archetypes keep the look varied but never accidental: each one is
 * a composed set of gradients rather than noise.
 */
export function drawGeneratedBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  seed: number,
  primary: string,
  secondary: string,
  archetype?: number,
): void {
  const rand = mulberry32(seed * 2654435761);
  const kind = archetype === undefined ? Math.floor(rand() * 12) : ((archetype % 12) + 12) % 12;
  const w = width;
  const h = height;
  const reach = Math.hypot(w, h) * 0.5;

  const base = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  const deep = mix('#06060c', mix(primary, secondary, 0.5), 0.28);
  base.addColorStop(0, deep);
  base.addColorStop(1, '#040406');
  ctx.fillStyle = base;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  const blob = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.55, rgba(color, alpha * 0.45));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  switch (kind) {
    case 0: {
      // Aurora: two long ribbons of colour drifting across a dark sky.
      for (let i = 0; i < 4; i++) {
        const phase = rand() * Math.PI * 2;
        const drift = Math.sin(time * (0.06 + i * 0.015) + phase) * reach * 0.22;
        const lift = Math.cos(time * 0.05 + phase) * reach * 0.1;
        blob(-reach * 0.35 + drift, -reach * 0.15 + lift + i * reach * 0.16, reach * (0.5 + i * 0.08), i % 2 ? secondary : primary, 0.38 - i * 0.055);
      }
      const beam = ctx.createLinearGradient(-w * 0.1, -h * 0.5, w * 0.25, h * 0.5);
      beam.addColorStop(0, rgba('#ffffff', 0));
      beam.addColorStop(0.45, rgba(mix(primary, '#ffffff', 0.5), 0.07));
      beam.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = beam;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 1: {
      // Dusk: a low sun and stacked haze bands.
      const horizon = h * 0.18;
      const sun = ctx.createRadialGradient(0, horizon, 0, 0, horizon, reach * 0.55);
      sun.addColorStop(0, rgba(mix(primary, '#ffffff', 0.25), 0.62));
      sun.addColorStop(0.35, rgba(primary, 0.3));
      sun.addColorStop(1, rgba(secondary, 0));
      ctx.fillStyle = sun;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      for (let i = 0; i < 7; i++) {
        const y = horizon - h * 0.1 + i * h * 0.11;
        const band = ctx.createLinearGradient(0, y, 0, y + h * 0.05);
        band.addColorStop(0, rgba(i % 2 ? secondary : primary, 0.05));
        band.addColorStop(1, rgba('#000000', 0));
        ctx.fillStyle = band;
        ctx.fillRect(-w / 2, y, w, h * 0.05);
      }
      blob(0, horizon, reach * 0.4, mix(primary, '#ffffff', 0.15), 0.22);
      break;
    }
    case 2: {
      // Spotlight: one hard shaft of light over a mostly empty stage.
      const cx = w * 0.08 * Math.sin(time * 0.07);
      const shaft = ctx.createLinearGradient(cx, -h / 2, cx + w * 0.12, h / 2);
      shaft.addColorStop(0, rgba(mix(primary, '#ffffff', 0.35), 0.36));
      shaft.addColorStop(0.45, rgba(primary, 0.17));
      shaft.addColorStop(1, rgba('#000000', 0));
      ctx.fillStyle = shaft;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      blob(cx, -h * 0.05, reach * 0.5, secondary, 0.18);
      const rim = ctx.createRadialGradient(w * 0.42, h * 0.28, 0, w * 0.42, h * 0.28, reach * 0.38);
      rim.addColorStop(0, rgba(secondary, 0.22));
      rim.addColorStop(1, rgba(secondary, 0));
      ctx.fillStyle = rim;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 3: {
      // Mesh: five overlapping soft lights, slowly orbiting.
      const count = 5;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + time * 0.05 * (i % 2 ? 1 : -1);
        const radius = reach * (0.25 + (i % 3) * 0.14);
        const x = Math.cos(angle) * radius * 0.8;
        const y = Math.sin(angle) * radius * 0.55;
        const size = reach * (0.34 + rand() * 0.22);
        blob(x, y, size, i % 2 === 0 ? primary : secondary, 0.33);
      }
      blob(0, 0, reach * 0.55, mix(primary, secondary, 0.5), 0.12);
      break;
    }
    case 4: {
      // Waves: long ribbons of light swimming across the frame.
      for (let band = 0; band < 5; band++) {
        const yBase = -h * 0.3 + band * h * 0.15;
        ctx.beginPath();
        for (let x = -w / 2; x <= w / 2; x += w / 48) {
          const y = yBase + Math.sin(x * 0.0035 + time * (0.4 + band * 0.07) + band) * h * 0.06;
          if (x === -w / 2) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(band % 2 ? secondary : primary, 0.26);
        ctx.lineWidth = h * (0.03 + band * 0.006);
        ctx.lineCap = 'round';
        ctx.shadowBlur = 40;
        ctx.shadowColor = band % 2 ? secondary : primary;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      break;
    }
    case 5: {
      // Rings: concentric halos around the centre.
      const count = 9;
      for (let i = 0; i < count; i++) {
        const radius = reach * (0.1 + (i / count) * 0.85) + Math.sin(time * 0.5 + i * 0.5) * 6;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(i % 2 ? secondary : primary, 0.22 - i * 0.014);
        ctx.lineWidth = Math.max(1.5, 10 - i * 0.8);
        ctx.stroke();
      }
      blob(0, 0, reach * 0.45, primary, 0.2);
      break;
    }
    case 6: {
      // Grid: a receding perspective floor.
      const horizon = -h * 0.16;
      const vanishX = w * 0.06 * Math.sin(time * 0.12);
      ctx.strokeStyle = rgba(primary, 0.18);
      ctx.lineWidth = 1.6;
      for (let i = 1; i <= 9; i++) {
        const y = horizon + (h / 2 - horizon) * Math.pow(i / 9, 1.7);
        ctx.beginPath();
        ctx.moveTo(-w / 2, y);
        ctx.lineTo(w / 2, y);
        ctx.stroke();
      }
      for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(vanishX, horizon);
        ctx.lineTo(vanishX + i * w * 0.14, h / 2);
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(vanishX, horizon, 0, vanishX, horizon, reach * 0.5);
      glow.addColorStop(0, rgba(secondary, 0.32));
      glow.addColorStop(1, rgba(secondary, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 7: {
      // Bokeh: drifting out-of-focus lights.
      for (let i = 0; i < 44; i++) {
        const px = (rand() - 0.5) * w;
        const py = (rand() - 0.5) * h;
        const size = 12 + rand() * 90;
        const drift = Math.sin(time * (0.1 + rand() * 0.2) + i) * 18;
        const tint = i % 3 === 0 ? secondary : primary;
        const g = ctx.createRadialGradient(px + drift, py, 0, px + drift, py, size);
        g.addColorStop(0, rgba(tint, 0.18 + rand() * 0.16));
        g.addColorStop(0.7, rgba(tint, 0.08));
        g.addColorStop(1, rgba(tint, 0));
        ctx.fillStyle = g;
        ctx.fillRect(px + drift - size, py - size, size * 2, size * 2);
      }
      break;
    }
    case 8: {
      // Streaks: diagonal light through a dark room.
      ctx.save();
      ctx.rotate(-Math.PI / 5);
      for (let i = 0; i < 7; i++) {
        const x = -reach + i * (reach * 2 / 7) + Math.sin(time * 0.2 + i) * 12;
        const g = ctx.createLinearGradient(x, 0, x + reach * 0.06, 0);
        g.addColorStop(0, rgba(primary, 0));
        g.addColorStop(0.5, rgba(i % 2 ? secondary : primary, 0.2));
        g.addColorStop(1, rgba(primary, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x, -reach, reach * 0.06, reach * 2);
      }
      ctx.restore();
      blob(0, 0, reach * 0.6, mix(primary, secondary, 0.5), 0.12);
      break;
    }
    case 9: {
      // Prism: colour wedges turning slowly around the centre.
      ctx.save();
      ctx.rotate(time * 0.04);
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2;
        const a1 = a0 + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach * 1.3, a0, a1);
        ctx.closePath();
        ctx.fillStyle = rgba(i % 2 ? secondary : primary, 0.13 + (i % 3) * 0.03);
        ctx.fill();
      }
      ctx.restore();
      blob(0, 0, reach * 0.5, mix(primary, '#ffffff', 0.2), 0.16);
      break;
    }
    case 10: {
      // Horizon: a hard line of light under a dark sky.
      const horizon = h * 0.12;
      const sky = ctx.createLinearGradient(0, -h / 2, 0, horizon);
      sky.addColorStop(0, rgba('#05050a', 1));
      sky.addColorStop(1, rgba(mix(primary, secondary, 0.4), 0.35));
      ctx.fillStyle = sky;
      ctx.fillRect(-w / 2, -h / 2, w, horizon + h / 2);
      const ground = ctx.createLinearGradient(0, horizon, 0, h / 2);
      ground.addColorStop(0, rgba(secondary, 0.18));
      ground.addColorStop(1, rgba('#040406', 1));
      ctx.fillStyle = ground;
      ctx.fillRect(-w / 2, horizon, w, h / 2);
      const line = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      line.addColorStop(0, rgba(primary, 0));
      line.addColorStop(0.5, rgba(mix(primary, '#ffffff', 0.6), 0.85));
      line.addColorStop(1, rgba(primary, 0));
      ctx.fillStyle = line;
      ctx.fillRect(-w / 2, horizon - 1.5, w, 3);
      blob(0, horizon, reach * 0.38, mix(primary, '#ffffff', 0.3), 0.16);
      break;
    }
    default: {
      // Clouds: soft layered haze drifting sideways.
      for (let i = 0; i < 8; i++) {
        const px = Math.sin(time * 0.04 + i * 1.7) * w * 0.5;
        const py = -h * 0.32 + (i / 8) * h * 0.6;
        const size = reach * (0.3 + (i % 3) * 0.12);
        blob(px, py, size, i % 2 ? secondary : primary, 0.16);
      }
      break;
    }
  }

  // A soft floor shadow so the type always has something to sit on.
  const floor = ctx.createLinearGradient(0, h * 0.12, 0, h / 2);
  floor.addColorStop(0, rgba('#000000', 0));
  floor.addColorStop(1, rgba('#000000', 0.55));
  ctx.fillStyle = floor;
  ctx.fillRect(-w / 2, h * 0.12, w, h * 0.38);

  const vignette = ctx.createRadialGradient(0, 0, Math.min(w, h) * 0.2, 0, 0, reach * 1.05);
  vignette.addColorStop(0, rgba('#000000', 0));
  vignette.addColorStop(1, rgba('#000000', 0.62));
  ctx.fillStyle = vignette;
  ctx.fillRect(-w / 2, -h / 2, w, h);
}

/** The quiet backdrop used when the user picks "None". */
export function drawPlainBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  primary: string,
  secondary: string,
): void {
  ctx.fillStyle = '#06060a';
  ctx.fillRect(-width / 2, -height / 2, width, height);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.hypot(width, height) * 0.45);
  glow.addColorStop(0, rgba(mix(primary, secondary, 0.4), 0.14));
  glow.addColorStop(1, rgba('#000000', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-width / 2, -height / 2, width, height);
}

/** A deterministic cover for songs that arrive without artwork. */
export function makeCoverArt(initials: string, primary: string, secondary: string, seed: number, size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rand = mulberry32(seed >>> 0);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, mix(secondary, '#000000', 0.25));
  grad.addColorStop(1, mix(primary, '#000000', 0.1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 5; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.15 + rand() * 0.35);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(i % 2 ? primary : secondary, 0.55));
    g.addColorStop(1, rgba(i % 2 ? primary : secondary, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.012;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * (0.22 + i * 0.11), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, size * 0.62, size, size * 0.38);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(size * 0.3)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials.slice(0, 2).toUpperCase(), size / 2, size * 0.8);
  return canvas;
}

export function initialsOf(name: string): string {
  const words = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'SF';
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`;
}

export function loadImageFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    img.src = url;
  });
}

export function loadVideoFile(file: File | Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That video could not be read.'));
    };
    video.src = url;
    video.load();
  });
}

/** Loads a picture from a URL that is allowed to be drawn into a canvas. */
export function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That picture could not be loaded.'));
    image.src = url;
  });
}

/** Loads a clip for the background; muted, looped and canvas-safe. */
export function loadVideoUrl(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('That clip could not be loaded.'));
    video.src = url;
    video.load();
  });
}