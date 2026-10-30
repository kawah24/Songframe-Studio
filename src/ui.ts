import { listFonts, suggestedFonts } from './fonts';
import { ASPECTS, AUDIO_BITRATES, EFFECTS, FRAME_RATES, OUTPUT_HEIGHTS, PALETTES, PRESETS, formatTime } from './presets';
import type { Align, BgKind, Config, EffectKey, FontId, LyricsPos, LyricsStyle, TextLayer } from './types';

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T => {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  return element as unknown as T;
};

export const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll(selector)) as unknown as T[];

export function toast(message: string, kind: 'info' | 'err' = 'info'): void {
  const host = $('#toasts');
  const item = document.createElement('div');
  item.className = kind === 'err' ? 'toast err' : 'toast';
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => {
    item.style.transition = 'opacity .25s, transform .25s';
    item.style.opacity = '0';
    item.style.transform = 'translateY(6px)';
    setTimeout(() => item.remove(), 260);
  }, kind === 'err' ? 5200 : 3200);
}

const ICONS: Record<string, string> = {
  'NCS Circle': '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  'Linear Bars': '<path d="M5 20V10M10 20V5M15 20V8M20 20v-6"/>',
  'Dual Mirror': '<path d="M12 3v18M3 7h6M3 12h8M3 17h5M21 7h-6M21 12h-8M21 17h-5"/>',
  'Center Wave': '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="9.8"/>',
  Orbital: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="4 3"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.5v3"/>',
  Hexagon: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4L12 2.8Z"/><path d="M12 8.2 16 10.4v4.4L12 17l-4-2.2v-4.4L12 8.2Z"/>',
  Oscilloscope: '<path d="M2 12h3l2.5-6 3 12 3-8 2.5 4H22"/>',
  'Digital Rain': '<path d="M7 4v6M7 14v6M12 3v10M12 17v4M17 5v8M17 17v3"/>',
  Shockwave: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="9"/>',
  Minimal: '<path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3"/><path d="M9 12h6"/>',
  Waveform: '<path d="M3 12v-2M6.5 12V7M10 12V4M13.5 12V9M17 12V6M20.5 12v-3"/>',
  Vinyl: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/>',
  Lyrics: '<path d="M4 7h9M4 12h16M4 17h11"/><path d="M18 6v4"/>',
  Halo: '<ellipse cx="12" cy="14" rx="9" ry="3.6"/><path d="M12 10.4V4M7 11.6V7M17 11.6V7M4.2 13v-2M19.8 13v-2"/>',
};

function svg(paths: string, size = 24): string {
  return `<svg viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--p', `${percent.toFixed(2)}%`);
}

export function decorateRanges(root: ParentNode = document): void {
  $$<HTMLInputElement>('input[type="range"]', root).forEach((input) => {
    paintRange(input);
    input.addEventListener('input', () => paintRange(input));
  });
}

export function buildPresetGrid(onPick: (id: Config['preset']) => void): void {
  const grid = $('#presetGrid');
  grid.innerHTML = '';
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    button.dataset.preset = preset.id;
    button.title = preset.hint;
    button.innerHTML = `${svg(ICONS[preset.id] ?? ICONS.Minimal)}<span>${preset.label}</span>`;
    button.addEventListener('click', () => onPick(preset.id));
    grid.appendChild(button);
  }
}

export function syncPresetGrid(active: Config['preset']): void {
  $$('#presetGrid .preset-card').forEach((card) => {
    card.classList.toggle('is-active', (card as HTMLElement).dataset.preset === active);
  });
}

interface SegItem {
  value: string;
  label: string;
  hint?: string;
}

export function buildSeg(selector: string, items: SegItem[], active: string, onPick: (value: string) => void, tight = false): void {
  const host = $(selector);
  host.innerHTML = '';
  host.classList.toggle('tight', tight);
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = item.value;
    button.textContent = item.label;
    if (item.hint) button.title = item.hint;
    if (item.value === active) button.classList.add('is-active');
    button.addEventListener('click', () => onPick(item.value));
    host.appendChild(button);
  }
}

export function buildSegments(config: Config, handlers: {
  setAspect: (value: Config['aspect']) => void;
  setHeight: (value: Config['height']) => void;
  setFps: (value: Config['fps']) => void;
  setBitrate: (value: Config['audioKbps']) => void;
  setBg: (value: BgKind) => void;
  setLyricStyle: (value: LyricsStyle) => void;
  setLyricPos: (value: LyricsPos) => void;
}): void {
  buildSeg('#aspectSeg', ASPECTS.map((entry) => ({ value: entry.id, label: entry.id, hint: entry.label })), config.aspect, (value) => handlers.setAspect(value as Config['aspect']));
  buildSeg('#sizeSeg', OUTPUT_HEIGHTS.map((height) => ({ value: String(height), label: `${height}p` })), String(config.height), (value) => handlers.setHeight(Number(value) as Config['height']));
  buildSeg('#fpsSeg', FRAME_RATES.map((fps) => ({ value: String(fps), label: `${fps} fps` })), String(config.fps), (value) => handlers.setFps(Number(value) as Config['fps']));
  buildSeg('#bitrateSeg', AUDIO_BITRATES.map((rate) => ({ value: String(rate), label: `${rate}` })), String(config.audioKbps), (value) => handlers.setBitrate(Number(value) as Config['audioKbps']), true);
  buildSeg('#bgSeg', [
    { value: 'generated', label: 'Auto' },
    { value: 'pattern', label: 'Pattern' },
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
    { value: 'none', label: 'None' },
  ], config.bg, (value) => handlers.setBg(value as BgKind), true);
  buildSeg('#lyricStyleSeg', [
    { value: 'karaoke', label: 'Karaoke' },
    { value: 'lines', label: 'Lines' },
    { value: 'scroll', label: 'Scroll' },
  ], config.lyrics.style, (value) => handlers.setLyricStyle(value as LyricsStyle), true);
  buildSeg('#lyricPosSeg', [
    { value: 'bottom', label: 'Bottom' },
    { value: 'center', label: 'Center' },
    { value: 'top', label: 'Top' },
  ], config.lyrics.pos, (value) => handlers.setLyricPos(value as LyricsPos), true);
}

export function buildSwatches(current: string, onPick: (primary: string, secondary: string) => void): void {
  const host = $('#swatches');
  host.innerHTML = '';
  for (const palette of PALETTES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.title = palette.name;
    button.dataset.primary = palette.primary;
    button.innerHTML = `<span style="background:${palette.primary}"></span><span style="background:${palette.secondary}"></span>`;
    if (palette.primary === current) button.classList.add('is-active');
    button.addEventListener('click', () => onPick(palette.primary, palette.secondary));
    host.appendChild(button);
  }
}

export function syncSwatches(primary: string): void {
  $$('#swatches .swatch').forEach((swatch) => {
    swatch.classList.toggle('is-active', (swatch as HTMLElement).dataset.primary === primary);
  });
}

export function buildFxList(config: Config, handlers: {
  toggle: (key: EffectKey, on: boolean) => void;
  amount: (key: EffectKey, value: number) => void;
}): void {
  const host = $('#fxList');
  host.innerHTML = '';
  for (const effect of EFFECTS) {
    const item = document.createElement('div');
    item.className = 'fx-item';
    item.dataset.key = effect.key;
    const enabled = config.effects[effect.key];
    if (enabled) item.classList.add('is-on');
    item.innerHTML = `
      <div class="fx-head">
        <div>
          <div class="fx-name">${effect.label}</div>
          <div class="fx-hint">${effect.hint}</div>
        </div>
        <button class="switch" type="button" role="switch" aria-checked="${enabled}" aria-pressed="${enabled}" aria-label="${effect.label}"></button>
      </div>
      <div class="fx-amount">
        <div class="field">
          <div class="field-top"><label>Intensity</label><output>${Math.round(config.amounts[effect.key] * 100)}%</output></div>
          <input type="range" min="0" max="100" step="1" value="${Math.round(config.amounts[effect.key] * 100)}" />
        </div>
      </div>`;

    const toggle = $<HTMLButtonElement>('.switch', item);
    toggle.addEventListener('click', () => {
      const next = !item.classList.contains('is-on');
      item.classList.toggle('is-on', next);
      toggle.setAttribute('aria-pressed', String(next));
      toggle.setAttribute('aria-checked', String(next));
      handlers.toggle(effect.key, next);
    });

    const range = $<HTMLInputElement>('input[type="range"]', item);
    const output = $<HTMLOutputElement>('.fx-amount output', item);
    paintRange(range);
    range.addEventListener('input', () => {
      paintRange(range);
      output.textContent = `${range.value}%`;
      handlers.amount(effect.key, Number(range.value) / 100);
    });

    host.appendChild(item);
  }
}

const ALIGN_LABEL: Record<Align, string> = { left: 'Left', center: 'Centre', right: 'Right' };

export function renderTextList(layers: TextLayer[], activeId: string | null, handlers: {
  select: (id: string) => void;
  update: (id: string, patch: Partial<TextLayer>) => void;
  remove: (id: string) => void;
}): void {
  const host = $('#textList');
  host.innerHTML = '';
  layers.forEach((layer) => {
    const item = document.createElement('div');
    item.className = 'text-item';
    if (layer.id === activeId) item.classList.add('is-active');
    item.innerHTML = `
      <div class="text-head">
        <span class="swatch-dot" style="background:${layer.color}"></span>
        <strong>${escapeHtml(layer.text || 'Empty layer')}</strong>
        <span class="text-tools">
          <button class="btn icon" type="button" data-act="remove" title="Remove layer" aria-label="Remove layer">
            ${svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', 24)}
          </button>
        </span>
      </div>
      <div class="text-body" ${layer.id === activeId ? '' : 'hidden'}>
        <input type="text" data-field="text" value="${escapeHtml(layer.text)}" placeholder="Your text" />
        <div class="mini-grid">
          <div class="field">
            <div class="field-top"><label>Size</label><output>${Math.round(layer.size)}</output></div>
            <input type="range" data-field="size" min="12" max="160" step="1" value="${Math.round(layer.size)}" />
          </div>
          <div class="field">
            <div class="field-top"><label>Opacity</label><output>${Math.round(layer.opacity * 100)}%</output></div>
            <input type="range" data-field="opacity" min="10" max="100" step="1" value="${Math.round(layer.opacity * 100)}" />
          </div>
          <div class="field">
            <div class="field-top"><label>Glow</label><output>${Math.round((layer.glow ?? 0) * 100)}%</output></div>
            <input type="range" data-field="glow" min="0" max="100" step="1" value="${Math.round((layer.glow ?? 0) * 100)}" />
          </div>
        </div>
        <div class="mini-grid">
          <label class="color-field"><span>Colour</span><input type="color" data-field="color" value="${layer.color}" /></label>
          <select data-field="font">
            ${fontOptions(layer.font)}
          </select>
        </div>
        <div class="mini-grid">
          <div class="seg tight" data-role="align">
            ${(['left', 'center', 'right'] as Align[]).map((align) => `<button type="button" data-align="${align}" class="${layer.align === align ? 'is-active' : ''}">${ALIGN_LABEL[align]}</button>`).join('')}
          </div>
          <label class="check"><input type="checkbox" data-field="bold" ${layer.bold ? 'checked' : ''} /> Bold</label>
        </div>
      </div>`;

    $('.text-head', item).addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-act="remove"]')) return;
      handlers.select(layer.id);
    });

    $('[data-act="remove"]', item).addEventListener('click', (event) => {
      event.stopPropagation();
      handlers.remove(layer.id);
    });

    const textInput = $<HTMLInputElement>('[data-field="text"]', item);
    textInput.addEventListener('input', () => {
      handlers.update(layer.id, { text: textInput.value });
      const title = $('strong', item);
      title.textContent = textInput.value || 'Empty layer';
    });

    const size = $<HTMLInputElement>('[data-field="size"]', item);
    size.addEventListener('input', () => {
      $('output', size.closest('.field') as HTMLElement).textContent = size.value;
      handlers.update(layer.id, { size: Number(size.value) });
    });

    const opacity = $<HTMLInputElement>('[data-field="opacity"]', item);
    opacity.addEventListener('input', () => {
      $('output', opacity.closest('.field') as HTMLElement).textContent = `${opacity.value}%`;
      handlers.update(layer.id, { opacity: Number(opacity.value) / 100 });
    });

    const glow = $<HTMLInputElement>('[data-field="glow"]', item);
    glow.addEventListener('input', () => {
      $('output', glow.closest('.field') as HTMLElement).textContent = `${glow.value}%`;
      handlers.update(layer.id, { glow: Number(glow.value) / 100 });
    });

    const color = $<HTMLInputElement>('[data-field="color"]', item);
    color.addEventListener('input', () => {
      $('.swatch-dot', item).setAttribute('style', `background:${color.value}`);
      handlers.update(layer.id, { color: color.value });
    });

    const font = $<HTMLSelectElement>('[data-field="font"]', item);
    font.addEventListener('change', () => handlers.update(layer.id, { font: font.value as FontId }));

    const bold = $<HTMLInputElement>('[data-field="bold"]', item);
    bold.addEventListener('change', () => handlers.update(layer.id, { bold: bold.checked }));

    $$('[data-align]', item).forEach((button) => {
      button.addEventListener('click', () => {
        $$('[data-align]', item).forEach((other) => other.classList.remove('is-active'));
        button.classList.add('is-active');
        handlers.update(layer.id, { align: (button as HTMLElement).dataset.align as Align });
      });
    });

    decorateRanges(item);
    host.appendChild(item);
  });
}

function optionList(fonts: string[], current: string): string {
  return fonts
    .map((font) => `<option value="${escapeHtml(font)}" ${font === current ? 'selected' : ''}>${escapeHtml(font)}</option>`)
    .join('');
}

/**
 * Suggested families first, then everything installed — a Windows box can carry
 * several hundred families, so the long tail lives in its own group.
 */
function fontOptions(current: string): string {
  const all = listFonts();
  const items = all.some((font) => font.toLowerCase() === current.toLowerCase()) ? all : [current, ...all];
  const preferred = new Set(suggestedFonts().map((font) => font.toLowerCase()));
  const top = items.filter((font) => preferred.has(font.toLowerCase()) || font === current);
  const rest = items.filter((font) => !top.includes(font));
  const groups = [`<optgroup label="Suggested">${optionList(top, current)}</optgroup>`];
  if (rest.length > 0) groups.push(`<optgroup label="All installed (${rest.length})">${optionList(rest, current)}</optgroup>`);
  return groups.join('');
}

/** Fills any font menu (text layers and lyrics) with the system list. */
export function buildFontSelect(select: HTMLSelectElement, current: string): void {
  select.innerHTML = fontOptions(current);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export function setActiveTab(name: string): void {
  $$('.tab').forEach((tab) => {
    const active = (tab as HTMLElement).dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $$('.pane').forEach((pane) => {
    pane.classList.toggle('is-active', (pane as HTMLElement).dataset.pane === name);
  });
}

export function drawSeekWave(canvas: HTMLCanvasElement, peaks: Float32Array | null, progress: number, primary: string): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!peaks || peaks.length === 0) return;

  const bars = Math.max(24, Math.floor(width / (3 * ratio)));
  const barWidth = width / bars;
  const middle = height * 0.62;
  for (let i = 0; i < bars; i++) {
    const value = peaks[Math.min(peaks.length - 1, Math.floor((i / bars) * peaks.length))];
    const barHeight = Math.max(1.5 * ratio, Math.pow(value, 0.75) * height * 0.9);
    ctx.fillStyle = i / bars <= progress ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(i * barWidth, middle - barHeight / 2, Math.max(1, barWidth * 0.6), barHeight);
  }
  ctx.fillStyle = primary;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(width * progress, 0, 1.5 * ratio, height);
  ctx.globalAlpha = 1;
}

export function updateTimeLabels(now: number, total: number): void {
  $('#timeNow').textContent = formatTime(now);
  $('#timeTotal').textContent = formatTime(total);
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** A small in-app confirmation; window.confirm is at the mercy of the host. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'modal confirm';
    host.innerHTML = `
      <div class="confirm-card" role="alertdialog" aria-modal="true">
        <h2>${escapeHtml(options.title)}</h2>
        <p>${escapeHtml(options.message)}</p>
        <div class="confirm-actions">
          <button class="btn ghost" type="button" data-value="0">${escapeHtml(options.cancelLabel ?? 'Cancel')}</button>
          <button class="btn primary" type="button" data-value="1">${escapeHtml(options.confirmLabel ?? 'Continue')}</button>
        </div>
      </div>`;
    document.body.appendChild(host);

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') finish(false);
      if (event.key === 'Enter') finish(true);
    };
    const finish = (value: boolean): void => {
      document.removeEventListener('keydown', onKey);
      host.remove();
      resolve(value);
    };

    host.addEventListener('click', (event) => {
      if (event.target === host) {
        finish(false);
        return;
      }
      const value = (event.target as HTMLElement).closest<HTMLElement>('[data-value]')?.dataset.value;
      if (value !== undefined) finish(value === '1');
    });
    document.addEventListener('keydown', onKey);
    host.querySelector<HTMLButtonElement>('[data-value="1"]')?.focus();
  });
}

export function modalProgress(stage: string, fraction: number, detail = ''): void {
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  const bar = $('#renderBar');
  bar.style.width = `${percent}%`;
  $('#renderPercent').textContent = `${percent}%`;
  $('#renderSub').textContent = stage;
  $('#renderDetail').textContent = detail;
}
