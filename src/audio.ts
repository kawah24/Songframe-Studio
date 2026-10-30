import { FFT_SIZE, Spectrum } from './fft';
import type { Frame } from './types';

export const TARGET_RATE = 48000;

export interface Song {
  name: string;
  /** Seconds. */
  duration: number;
  /** Always 48 kHz stereo, whatever the file carried. */
  buffer: AudioBuffer;
  /** Normalised peaks for the seek bar, 0..1. */
  peaks: Float32Array;
}

const spectrum = new Spectrum(TARGET_RATE);
const scratch = new Float32Array(FFT_SIZE);
let scratchRate = -1;

/** Decodes a picked file into the 48 kHz stereo buffer everything else uses. */
export async function decodeSong(file: File, ctx: AudioContext): Promise<Song> {
  const bytes = await file.arrayBuffer();
  const decoded = await ctx.decodeAudioData(bytes);
  const buffer = await toStereo(decoded);
  return {
    name: file.name,
    duration: buffer.duration,
    buffer,
    peaks: computePeaks(buffer),
  };
}

async function toStereo(decoded: AudioBuffer): Promise<AudioBuffer> {
  if (decoded.numberOfChannels === 2 && decoded.sampleRate === TARGET_RATE) return decoded;
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(2, length, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

export function computePeaks(buffer: AudioBuffer, buckets = 1600): Float32Array {
  const peaks = new Float32Array(buckets);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const per = Math.max(1, Math.floor(left.length / buckets));
  for (let b = 0; b < buckets; b++) {
    const from = b * per;
    const to = Math.min(left.length, from + per);
    let peak = 0;
    for (let i = from; i < to; i++) {
      const a = Math.abs(left[i]);
      const c = Math.abs(right[i]);
      if (a > peak) peak = a;
      if (c > peak) peak = c;
    }
    peaks[b] = Math.min(1, peak);
  }
  return peaks;
}

/**
 * The one function that turns a moment of the song into drawing data. Preview
 * and export both call it, so a frame at 12.4 s looks identical in both.
 */
export function frameAt(song: Song, time: number, sensitivity = 1): Frame {
  const buffer = song.buffer;
  const rate = buffer.sampleRate;
  if (rate !== scratchRate) {
    spectrum.setSampleRate(rate);
    scratchRate = rate;
  }
  const center = Math.round(time * rate);
  const start = center - (FFT_SIZE >> 1);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  for (let i = 0; i < FFT_SIZE; i++) {
    const at = start + i;
    scratch[i] = at >= 0 && at < left.length ? (left[at] + right[at]) * 0.5 : 0;
  }
  return spectrum.analyse(scratch, rate, time, sensitivity);
}

/** Plays the decoded buffer; the only thing holding the playhead. */
export class Playback {
  readonly ctx: AudioContext;
  private readonly gain: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private song: Song | null = null;
  private startedAt = 0;
  private offset = 0;
  private volume = 1;
  playing = false;
  onEnded: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: TARGET_RATE, latencyHint: 'interactive' });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);
  }

  setSong(song: Song | null): void {
    this.stop();
    this.song = song;
    this.offset = 0;
  }

  get time(): number {
    if (!this.playing) return this.offset;
    const elapsed = this.ctx.currentTime - this.startedAt;
    const limit = this.song?.duration ?? 0;
    return Math.min(limit, this.offset + Math.max(0, elapsed));
  }

  get duration(): number {
    return this.song?.duration ?? 0;
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.gain.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  async play(from = this.offset): Promise<void> {
    if (!this.song) return;
    await this.ctx.resume();
    this.stopSource();
    const source = this.ctx.createBufferSource();
    source.buffer = this.song.buffer;
    source.connect(this.gain);
    const startAt = Math.max(0, Math.min(this.song.duration - 0.01, from));
    source.onended = () => {
      if (this.source === source && this.playing) {
        this.playing = false;
        this.offset = this.song?.duration ?? 0;
        this.source = null;
        this.onEnded?.();
      }
    };
    source.start(0, startAt);
    this.source = source;
    this.offset = startAt;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    const at = this.time;
    this.stopSource();
    this.offset = Math.min(at, this.duration);
    this.playing = false;
  }

  seek(time: number): void {
    const target = Math.max(0, Math.min(this.duration, time));
    if (this.playing) {
      void this.play(target);
    } else {
      this.offset = target;
    }
  }

  private stopSource(): void {
    if (!this.source) return;
    try {
      this.source.onended = null;
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }

  private stop(): void {
    this.stopSource();
    this.playing = false;
  }
}
