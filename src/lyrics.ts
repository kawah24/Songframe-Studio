import type { LyricsConfig, LyricLine } from './types';
import { rgba } from './backgrounds';
import { fontFamily } from './fonts';

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const META_TAG = /^\[(ti|ar|al|by|re|ve|length|offset):(.*)\]$/i;
/** A whole cue that is only a sound description: [Music], (Applause), 【掌声】. */
const CUE_ONLY = /^[[(（【].*[\])）】]$/;
/** A bracketed aside inside a line: "hello [laughs] there". */
const CUE_INLINE = /\[[^\]]*\]|\([^)]*\)|（[^）]*）|【[^】]*】/g;

/** Drops the asides, keeps the words. */
function withoutCues(text: string): string {
  return text.replace(CUE_INLINE, ' ').replace(/\s+/g, ' ').trim();
}

const SECTION = /^[[【(]?(verse|chorus|bridge|intro|outro|pre[- ]?chorus|hook|refrain|drop|solo|break|interlude|instrumental|припев|куплет|бридж|интро|аутро)[^\]]*[\]】)]?$/i;

function seconds(min: string, sec: string, frac?: string): number {
  const base = Number(min) * 60 + Number(sec);
  if (!frac) return base;
  const scale = frac.length === 1 ? 0.1 : frac.length === 2 ? 0.01 : 0.001;
  return base + Number(frac) * scale;
}

/** Parses LRC (with optional enhanced word timings) into sortable lines. */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let offset = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const meta = META_TAG.exec(line);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') {
        const ms = Number(meta[2].trim());
        if (Number.isFinite(ms)) offset = -ms / 1000;
      }
      continue;
    }

    const stamps: number[] = [];
    TIME_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      stamps.push(seconds(match[1], match[2], match[3]));
    }
    const body = line.replace(TIME_TAG, '').trim();

    if (stamps.length === 0) {
      if (SECTION.test(body) || /^[[【].*[\]】]$/.test(body)) {
        lines.push({ time: lines.length ? lines[lines.length - 1].time + 0.001 : 0, text: body.replace(/^[[【]|[\]】]$/g, ''), isSection: true, words: [], weight: 0 });
      }
      continue;
    }

    const words: { time: number; text: string }[] = [];    const wordPattern = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g;
    let wordMatch: RegExpExecArray | null;
    let plainBody = body;
    while ((wordMatch = wordPattern.exec(body)) !== null) {
      words.push({
        time: Math.max(0, seconds(wordMatch[1], wordMatch[2], wordMatch[3]) + offset),
        text: wordMatch[4].replace(/\s+/g, ' ').trim(),
      });
    }
    if (words.length > 0) {
      plainBody = words.map((entry) => entry.text).join(' ');
      // A tag with no text after it means the file mixed formats; drop the word
      // timings rather than show an empty sweep.
      if (!words.some((entry) => entry.text)) words.length = 0;
    }

    let cleanText = plainBody.replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    let isSection = SECTION.test(cleanText) || /^[[【].*[\]】]$/.test(cleanText);
    // "[00:03] [Chorus] Light it up" carries its section tag inline; keep the
    // words and drop the tag rather than showing a stray bracket.
    const tagged = /^[[【]([^\]】]+)[\]】]\s*(.*)$/.exec(cleanText);
    if (tagged) {
      const rest = tagged[2].trim();
      if (rest) {
        cleanText = rest;
      } else {
        cleanText = tagged[1].trim();
        isSection = true;
      }
    }
    for (const stamp of stamps) {
      lines.push({
        time: Math.max(0, stamp + offset),
        text: cleanText.replace(/^[[【]|[\]】]$/g, ''),
        isSection,
        words: words.map((entry) => ({ time: entry.time, text: entry.text })),
        weight: Math.max(1, cleanText.length),
      });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

const SRT_CUE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function cueSeconds(hours: string, minutes: string, seconds: string, fraction: string): number {
  const scale = fraction.length === 1 ? 0.1 : fraction.length === 2 ? 0.01 : 0.001;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction) * scale;
}

/**
 * SubRip: numbered cues with explicit start and end times. Multiline cues are
 * joined and styling tags stripped.
 */
export function parseSrt(text: string): LyricLine[] {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const lines: LyricLine[] = [];
  for (const block of blocks) {
    const rows = block.split('\n').map((row) => row.trim()).filter(Boolean);
    if (rows.length < 2) continue;
    const cueIndex = rows.findIndex((row) => row.includes('-->'));
    if (cueIndex < 0) continue;
    const match = SRT_CUE.exec(rows[cueIndex]);
    if (!match) continue;
    const start = cueSeconds(match[1], match[2], match[3], match[4]);
    const end = cueSeconds(match[5], match[6], match[7], match[8]);
    const raw = rows
      .slice(cueIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .trim();
    if (!raw || CUE_ONLY.test(raw)) continue;
    const body = withoutCues(raw);
    if (!body) continue;
    lines.push({ time: start, end, text: body, isSection: false, words: [], weight: Math.max(1, body.length) });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** LRC, SRT or plain text — whichever the file turns out to be. */
export function parseLyrics(text: string, duration: number, maxWords = 8): LyricLine[] {
  let lines: LyricLine[];
  if (SRT_CUE.test(text)) lines = parseSrt(text);
  else if (/\[\d{1,3}:\d{2}/.test(text)) lines = parseLrc(text);
  else lines = distributePlainText(text, duration);
  return maxWords > 0 ? splitCues(lines, maxWords) : lines;
}

/**
 * Longer cues are cut into shorter ones, time shared by character count, so a
 * caption stays readable instead of being shrunk or clipped to fit.
 */
function splitCues(lines: LyricLine[], maxWords: number): LyricLine[] {
  const out: LyricLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const words = line.text.split(/\s+/).filter(Boolean);
    if (line.isSection || words.length <= maxWords) {
      out.push(line);
      continue;
    }
    const end = line.end ?? (lines[i + 1]?.time ?? line.time + Math.max(2, words.length * 0.4));
    const span = Math.max(0.4, end - line.time);
    const totalChars = words.reduce((sum, word) => sum + word.length, 0) || 1;
    let cursor = line.time;
    for (let start = 0; start < words.length; start += maxWords) {
      const chunk = words.slice(start, start + maxWords);
      const chars = chunk.reduce((sum, word) => sum + word.length, 0) || 1;
      const share = (chars / totalChars) * span;
      const text = chunk.join(' ');
      const timed: LyricLine['words'] = [];
      let wordCursor = cursor;
      for (const word of chunk) {
        timed.push({ time: wordCursor, text: word });
        wordCursor += (word.length / chars) * share;
      }
      out.push({
        time: cursor,
        end: Math.min(end, cursor + share),
        text,
        isSection: false,
        words: timed,
        weight: Math.max(1, text.length),
      });
      cursor += share;
    }
  }
  return out;
}

/** Spreads pasted, untimed lyrics evenly across the song. */
export function distributePlainText(text: string, duration: number): LyricLine[] {
  const raw = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // "[Music]" and friends are cues, not lyrics: they are never shown. Real
    // section markers ("[Verse 1]") stay, so the section feature keeps working.
    .filter((line) => !CUE_ONLY.test(line) || SECTION.test(line));
  if (raw.length === 0) return [];

  const span = Math.max(2, duration - 1.5);
  const totalWeight = raw.reduce((sum, line) => sum + Math.max(1, line.length), 0);
  const lines: LyricLine[] = [];
  let cursor = 0.75;

  for (const line of raw) {
    const isSection = SECTION.test(line) || /^[[【].*[\]】]$/.test(line);
    const body = withoutCues(line);
    if (!body) continue;
    const weight = Math.max(1, line.length);
    const share = (weight / totalWeight) * span;
    const words = line.split(/\s+/).filter(Boolean);
    const wordWeights = words.map((w) => Math.max(1, w.length));
    const wordTotal = wordWeights.reduce((sum, value) => sum + value, 0) || 1;
    let wordCursor = cursor;
    const timedWords = words.map((word, index) => {
      const at = wordCursor;
      wordCursor += (wordWeights[index] / wordTotal) * Math.max(0.25, share);
      return { time: at, text: word };
    });
    lines.push({
      time: cursor,
      text: body,
      isSection,
      words: isSection ? [] : timedWords,
      weight,
    });
    cursor += share;
  }
  return lines;
}

function lineProgress(line: LyricLine, t: number, end: number, fallback: number): number {
  const span = Math.max(0.2, end - line.time);
  if (line.words.length > 1) {
    const words = line.words;
    for (let i = words.length - 1; i >= 0; i--) {
      if (t >= words[i].time) {
        const next = i + 1 < words.length ? words[i + 1].time : end;
        const local = Math.max(0, Math.min(1, (t - words[i].time) / Math.max(0.05, next - words[i].time)));
        return Math.min(1, (i + local) / words.length);
      }
    }
    return 0;
  }
  return Math.max(0, Math.min(1, (t - line.time) / Math.max(0.2, Math.min(span, fallback))));
}

export function lyricIndexAt(lines: LyricLine[], t: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (t >= lines[i].time) return i;
  }
  return -1;
}

interface DrawOptions {
  cfg: LyricsConfig;
  lines: LyricLine[];
  time: number;
  /** Frame size in design space. */
  width: number;
  height: number;
}

/** Draws the synced lyric overlay in 1080-space with the origin at the centre. */
interface LyricRow {
  text: string;
  start: number;
  end: number;
}

export function drawLyrics(ctx: CanvasRenderingContext2D, opts: DrawOptions): void {
  const { cfg, lines, width, height } = opts;
  if (!cfg.enabled || lines.length === 0) return;

  const t = opts.time + cfg.offset;
  let index = lyricIndexAt(lines, t);
  if (index < 0) return;

  if (!cfg.showSections) {
    let probe = index;
    while (probe >= 0 && lines[probe].isSection) probe--;
    if (probe < 0) return;
    index = probe;
  }

  const current = lines[index];
  const nextTime =
    current.end && current.end > current.time
      ? current.end
      : index + 1 < lines.length
        ? lines[index + 1].time
        : current.time + 6;
  const y = cfg.pos === 'bottom' ? height * 0.5 - height * 0.115 : cfg.pos === 'top' ? -height * 0.5 + height * 0.115 : 0;
  const pill = rgba(cfg.pill, cfg.pillOpacity);
  const family = fontFamily(cfg.font);
  // Half the frame: a caption is a subtitle, not a headline across the picture.
  const maxWidth = width * 0.5;

  // Words wrap onto new rows, and only a single word that still cannot fit
  // shrinks the type. Rows carry their character range so the karaoke sweep
  // keeps running across the wrap.
  const layout = (text: string, requested: number, maxRows: number): { rows: LyricRow[]; size: number; widest: number } => {
    let size = Math.max(8, requested);
    let rows: LyricRow[] = [];
    let widest = 0;
    const floor = Math.max(9, requested * 0.4);
    for (let attempt = 0; attempt < 12; attempt++) {
      ctx.font = `${weight} ${size}px ${family}`;
      const words: { text: string; start: number }[] = [];
      const scan = /\S+/g;
      let hit = scan.exec(text);
      while (hit) {
        words.push({ text: hit[0], start: hit.index });
        hit = scan.exec(text);
      }
      rows = [];
      let rowText = '';
      let rowStart = 0;
      let rowEnd = 0;
      widest = 0;
      for (const word of words) {
        const candidate = rowText ? `${rowText} ${word.text}` : word.text;
        const measure = ctx.measureText(candidate).width;
        if (rowText && measure > maxWidth) {
          rows.push({ text: rowText, start: rowStart, end: rowEnd });
          widest = Math.max(widest, ctx.measureText(rowText).width);
          rowText = word.text;
          rowStart = word.start;
        } else if (!rowText) {
          rowStart = word.start;
          rowText = candidate;
        } else {
          rowText = candidate;
        }
        rowEnd = word.start + word.text.length;
      }
      if (rowText) {
        rows.push({ text: rowText, start: rowStart, end: rowEnd });
        widest = Math.max(widest, ctx.measureText(rowText).width);
      }
      const fitsWidth = widest <= maxWidth;
      if ((fitsWidth && rows.length <= maxRows) || size <= floor || size <= 9) break;
      const next =
        rows.length > maxRows && fitsWidth
          ? size * 0.9
          : Math.max(floor, size * (maxWidth / Math.max(widest, 1)) * 0.98);
      size = Math.max(floor, Math.min(size * 0.98, next));
    }
    // Nothing is ever cut: if the cue still needs another row at the smallest
    // size, it gets it. Shorter cues are what keeps that from happening.
    ctx.font = `${weight} ${size}px ${family}`;
    return { rows, size, widest };
  };

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const weight = cfg.bold === false ? 400 : 700;
  ctx.font = `${weight} ${cfg.size}px ${family}`;
  const glow = Math.max(0, Math.min(1, cfg.glow ?? 0));
  // Text opacity fades the letters, their drop shadow and the glow together.
  const textAlpha = Math.max(0, Math.min(1, cfg.opacity ?? 1));
  // The black drop shadow is painted over the glow, so ease it back as the glow
  // comes up, otherwise the halo is smothered before it can be seen.
  ctx.shadowColor = `rgba(0,0,0,${((0.9 - 0.5 * glow) * textAlpha).toFixed(3)})`;
  ctx.shadowBlur = Math.max(9, cfg.size * 0.2) * (1 - 0.35 * glow);
  ctx.shadowOffsetX = cfg.size * 0.04;
  ctx.shadowOffsetY = cfg.size * 0.07;
  ctx.fillStyle = cfg.color;

  // One wide shadow blur spreads the light thinner than a letter stem, which
  // leaves almost nothing visible. Stacked narrow layers accumulate instead.
  const glowLayers = [
    { blur: 0.05, alpha: 0.9 },
    { blur: 0.11, alpha: 0.7 },
    { blur: 0.23, alpha: 0.5 },
    { blur: 0.42, alpha: 0.3 },
  ];
  const paintGlow = (size: number, paint: () => void): void => {
    if (glow <= 0) return;
    const keepBlur = ctx.shadowBlur;
    const keepColor = ctx.shadowColor;
    const keepX = ctx.shadowOffsetX;
    const keepY = ctx.shadowOffsetY;
    const keepAlpha = ctx.globalAlpha;
    ctx.fillStyle = cfg.color;
    ctx.shadowColor = cfg.color;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    for (const layer of glowLayers) {
      ctx.shadowBlur = size * layer.blur * glow;
      ctx.globalAlpha = layer.alpha * glow * textAlpha;
      paint();
    }
    ctx.globalAlpha = keepAlpha;
    ctx.shadowBlur = keepBlur;
    ctx.shadowColor = keepColor;
    ctx.shadowOffsetX = keepX;
    ctx.shadowOffsetY = keepY;
  };

  const progress = lineProgress(current, t, nextTime, 5);

  if (cfg.style === 'karaoke') {
    const text = current.text;
    if (!text) {
      ctx.restore();
      return;
    }
    const { rows, size } = layout(text, cfg.size, Math.max(1, Math.round(cfg.lines)));
    const lineHeight = size * 1.26;
    const blockHeight = rows.length * lineHeight;
    const top = y - blockHeight / 2 + lineHeight / 2;
    const pillWidth = Math.min(width, rows.reduce((w, row) => Math.max(w, ctx.measureText(row.text).width), 0)) + size * 1.05;
    const pillHeight = blockHeight + size * 0.55;

    ctx.fillStyle = pill;
    ctx.beginPath();
    ctx.roundRect(-pillWidth / 2, y - pillHeight / 2, pillWidth, pillHeight, Math.min(pillHeight, size * 1.5) / 2);
    ctx.fill();

    paintGlow(size, () => {
      rows.forEach((row, index) => {
        ctx.fillText(row.text, 0, top + index * lineHeight);
      });
    });

    const total = Math.max(1, text.length);
    rows.forEach((row, i) => {
      const rowY = top + i * lineHeight;
      const rowWidth = ctx.measureText(row.text).width;
      ctx.globalAlpha = 0.4 * textAlpha;
      ctx.fillStyle = cfg.color;
      ctx.fillText(row.text, 0, rowY);
      ctx.globalAlpha = textAlpha;
      const span = Math.max(1, row.end - row.start);
      const fraction = Math.min(1, Math.max(0, (progress * total - row.start) / span));
      if (fraction > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-rowWidth / 2, rowY - lineHeight / 2, rowWidth * fraction, lineHeight);
        ctx.clip();
        ctx.fillStyle = cfg.highlight;
        ctx.fillText(row.text, 0, rowY);
        ctx.restore();
      }
    });
  } else if (cfg.style === 'lines') {
    const entries: { rows: LyricRow[]; size: number; active: boolean }[] = [];
    // "Visible lines" is a budget of drawn rows: the active cue takes what it
    // needs (up to the budget) and the next ones only get the remainder.
    let budget = Math.max(1, Math.round(cfg.lines));
    for (let i = index; i < lines.length && budget > 0; i++) {
      if (!cfg.showSections && lines[i].isSection) continue;
      const laid = layout(lines[i].text, cfg.size, budget);
      entries.push({ rows: laid.rows, size: laid.size, active: i === index });
      budget -= laid.rows.length;
    }
    const gap = cfg.size * 0.42;
    const totalHeight = entries.reduce((sum, entry) => sum + entry.rows.length * entry.size * 1.24, 0) + gap * (entries.length - 1);
    let cursor = y - totalHeight / 2;
    for (const entry of entries) {
      const lineHeight = entry.size * 1.24;
      const blockHeight = entry.rows.length * lineHeight;
      const alpha = entry.active ? 1 : 0.42;
      if (entry.active) {
        const widest = entry.rows.reduce((w, row) => Math.max(w, ctx.measureText(row.text).width), 0);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = pill;
        ctx.beginPath();
        ctx.roundRect(-Math.min(width, widest + entry.size) / 2, cursor - lineHeight * 0.14, Math.min(width, widest + entry.size), blockHeight + lineHeight * 0.28, entry.size * 0.7);
        ctx.fill();
        ctx.restore();
      }
      if (entry.active) {
        paintGlow(entry.size, () => {
          entry.rows.forEach((row, i) => {
            ctx.fillText(row.text, 0, cursor + lineHeight / 2 + i * lineHeight);
          });
        });
      }
      ctx.globalAlpha = alpha * textAlpha;
      entry.rows.forEach((row, i) => {
        ctx.fillStyle = cfg.color;
        ctx.fillText(row.text, 0, cursor + lineHeight / 2 + i * lineHeight);
      });
      ctx.globalAlpha = 1;
      cursor += blockHeight + gap;
    }
  } else {
    ctx.font = `${weight} ${cfg.size}px ${family}`;
    const metrics = ctx.measureText(current.text);
    const travel = width + metrics.width;
    const x = width * 0.5 - progress * travel;
    ctx.fillStyle = pill;
    ctx.fillRect(-width / 2, y - cfg.size * 0.85, width, cfg.size * 1.7);
    ctx.textAlign = 'left';
    paintGlow(cfg.size, () => {
      ctx.fillText(current.text, x, y);
    });

    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = cfg.color;
    ctx.fillText(current.text, x, y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export function lyricTextOf(lines: LyricLine[]): string {
  return lines.map((line) => line.text).join('\n');
}
