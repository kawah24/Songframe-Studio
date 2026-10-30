import type { LyricsConfig, LyricLine } from './types';
import { rgba } from './backgrounds';
import { fontFamily } from './fonts';

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const META_TAG = /^\[(ti|ar|al|by|re|ve|length|offset):(.*)\]$/i;
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
    const body = rows
      .slice(cueIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!body) continue;
    lines.push({ time: start, end, text: body, isSection: false, words: [], weight: Math.max(1, body.length) });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** LRC, SRT or plain text — whichever the file turns out to be. */
export function parseLyrics(text: string, duration: number): LyricLine[] {
  if (SRT_CUE.test(text)) return parseSrt(text);
  if (/\[\d{1,3}:\d{2}/.test(text)) return parseLrc(text);
  return distributePlainText(text, duration);
}

/** Spreads pasted, untimed lyrics evenly across the song. */
export function distributePlainText(text: string, duration: number): LyricLine[] {
  const raw = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (raw.length === 0) return [];

  const span = Math.max(2, duration - 1.5);
  const totalWeight = raw.reduce((sum, line) => sum + Math.max(1, line.length), 0);
  const lines: LyricLine[] = [];
  let cursor = 0.75;

  for (const line of raw) {
    const isSection = SECTION.test(line) || /^[[【].*[\]】]$/.test(line);
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
      text: line.replace(/^[[【]|[\]】]$/g, ''),
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
  const fontSize = cfg.size;
  const y = cfg.pos === 'bottom' ? height * 0.5 - height * 0.115 : cfg.pos === 'top' ? -height * 0.5 + height * 0.115 : 0;
  const pill = rgba(cfg.pill, cfg.pillOpacity);

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `700 ${fontSize}px ${fontFamily(cfg.font)}`;
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = fontSize * 0.35;
  ctx.fillStyle = cfg.color;

  const progress = lineProgress(current, t, nextTime, 5);

  if (cfg.style === 'karaoke') {
    const text = current.text;
    if (!text) {
      ctx.restore();
      return;
    }
    const metrics = ctx.measureText(text);
    const pillWidth = metrics.width + fontSize * 1.1;
    const pillHeight = fontSize * 1.5;
    ctx.fillStyle = pill;
    ctx.beginPath();
    ctx.roundRect(-pillWidth / 2, y - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = cfg.color;
    ctx.fillText(text, 0, y);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(-metrics.width / 2, y - pillHeight / 2, metrics.width * Math.max(0.001, progress), pillHeight);
    ctx.clip();
    ctx.fillStyle = cfg.highlight;
    ctx.fillText(text, 0, y);
    ctx.restore();
  } else if (cfg.style === 'lines') {
    const visible: { text: string; active: boolean }[] = [];
    for (let i = index; i < lines.length && visible.length < cfg.lines; i++) {
      if (!cfg.showSections && lines[i].isSection) continue;
      visible.push({ text: lines[i].text, active: i === index });
    }
    const lineHeight = fontSize * 1.55;
    const top = y - ((visible.length - 1) * lineHeight) / 2;
    visible.forEach((entry, i) => {
      const alpha = entry.active ? 1 : 0.42;
      const metrics = ctx.measureText(entry.text);
      if (entry.active) {
        const pillWidth = metrics.width + fontSize;
        const pillHeight = fontSize * 1.42;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = pill;
        ctx.beginPath();
        ctx.roundRect(-pillWidth / 2, top + i * lineHeight - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = cfg.color;
      ctx.fillText(entry.text, 0, top + i * lineHeight);
      ctx.globalAlpha = 1;
    });
  } else {
    const metrics = ctx.measureText(current.text);
    const travel = width + metrics.width;
    const x = width * 0.5 - progress * travel;
    ctx.fillStyle = pill;
    ctx.fillRect(-width / 2, y - fontSize * 0.85, width, fontSize * 1.7);
    ctx.textAlign = 'left';
    ctx.fillStyle = cfg.color;
    ctx.fillText(current.text, x, y);
  }

  ctx.restore();
}

export function lyricTextOf(lines: LyricLine[]): string {
  return lines.map((line) => line.text).join('\n');
}
