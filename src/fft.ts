import type { Frame } from './types';

export const FFT_SIZE = 2048;
export const BAND_COUNT = 96;
export const WAVE_SAMPLES = 1024;

const HALF = FFT_SIZE / 2;
const MIN_HZ = 20;
const MAX_HZ = 16000;
const DB_FLOOR = -70;

/**
 * A single radix-2 FFT and the mapping from magnitudes to the 96 perceptual
 * bands every preset draws from. One instance is reused for the whole session:
 * `analyse` fills and returns the same typed arrays, so callers must consume the
 * result before asking for the next frame.
 */
export class Spectrum {
  private readonly re = new Float32Array(FFT_SIZE);
  private readonly im = new Float32Array(FFT_SIZE);
  private readonly window = new Float32Array(FFT_SIZE);
  private readonly reverse = new Uint32Array(FFT_SIZE);
  private readonly cosTable = new Float32Array(HALF);
  private readonly sinTable = new Float32Array(HALF);
  private readonly magnitude = new Float32Array(HALF);
  private readonly edges = new Int32Array(BAND_COUNT + 1);
  private readonly tilt = new Float32Array(BAND_COUNT);
  private bandEdges = new Float32Array(0);
  private readonly bands = new Float32Array(BAND_COUNT);
  private readonly smoothed = new Float32Array(BAND_COUNT);
  private readonly wave = new Float32Array(WAVE_SAMPLES);
  private frame: Frame = {
    t: 0,
    bands: this.bands,
    wave: this.wave,
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
  };

  constructor(sampleRate = 48000) {
    const bits = Math.log2(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reverse[i] = r;
    }
    for (let i = 0; i < HALF; i++) {
      const angle = (-2 * Math.PI * i) / FFT_SIZE;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }
    for (let i = 0; i < BAND_COUNT; i++) {
      this.tilt[i] = 1 + 1.4 * Math.pow(i / (BAND_COUNT - 1), 1.1);
    }
    this.setSampleRate(sampleRate);
  }

  setSampleRate(sampleRate: number): void {
    const nyquist = sampleRate / 2;
    const top = Math.min(MAX_HZ, nyquist * 0.98);
    this.bandEdges = new Float32Array(BAND_COUNT + 1);
    for (let i = 0; i <= BAND_COUNT; i++) {
      const hz = MIN_HZ * Math.pow(top / MIN_HZ, i / BAND_COUNT);
      this.bandEdges[i] = hz;
      this.edges[i] = Math.max(1, Math.min(HALF - 1, Math.round((hz / nyquist) * HALF)));
    }
  }

  /** Analyses a window of mono samples and returns the shared frame object. */
  analyse(input: Float32Array, sampleRate: number, time = 0, gain = 1): Frame {
    if (input.length !== FFT_SIZE) throw new Error(`expected ${FFT_SIZE} samples`);
    if (this.bandEdges.length === 0 || sampleRate !== this.lastRate) {
      this.setSampleRate(sampleRate);
      this.lastRate = sampleRate;
    }

    let mean = 0;
    for (let i = 0; i < FFT_SIZE; i++) mean += input[i];
    mean /= FFT_SIZE;

    for (let i = 0; i < FFT_SIZE; i++) {
      const s = (input[i] - mean) * this.window[i];
      const at = this.reverse[i];
      this.re[at] = s;
      this.im[at] = 0;
    }

    for (let size = 2; size <= FFT_SIZE; size <<= 1) {
      const half = size >> 1;
      const step = FFT_SIZE / size;
      for (let i = 0; i < FFT_SIZE; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const c = this.cosTable[k];
          const s = this.sinTable[k];
          const a = i + j;
          const b = a + half;
          const br = this.re[b];
          const bi = this.im[b];
          const tr = c * br - s * bi;
          const ti = c * bi + s * br;
          this.re[b] = this.re[a] - tr;
          this.im[b] = this.im[a] - ti;
          this.re[a] += tr;
          this.im[a] += ti;
        }
      }
    }

    const scale = 1 / (FFT_SIZE / 4);
    const floor = Math.pow(10, DB_FLOOR / 20);
    for (let i = 0; i < HALF; i++) {
      const amp = Math.sqrt(this.re[i] * this.re[i] + this.im[i] * this.im[i]) * scale;
      this.magnitude[i] = amp;
    }

    for (let band = 0; band < BAND_COUNT; band++) {
      const from = this.edges[band];
      const to = Math.max(from + 1, this.edges[band + 1]);
      let peak = 0;
      for (let bin = from; bin < to; bin++) if (this.magnitude[bin] > peak) peak = this.magnitude[bin];
      const db = 20 * Math.log10(Math.max(peak, floor));
      const norm = Math.max(0, Math.min(1, (db - DB_FLOOR) / -DB_FLOOR));
      this.bands[band] = Math.min(1, Math.pow(norm, 1.3) * this.tilt[band]);
    }

    // A one-pole blur across neighbouring bands keeps a lone tone from drawing
    // a single spike, and a small floor gives the quiet end of the spectrum
    // something to show instead of a hole in the shape.
    for (let band = 0; band < BAND_COUNT; band++) {
      const prev = this.bands[Math.max(0, band - 1)];
      const next = this.bands[Math.min(BAND_COUNT - 1, band + 1)];
      this.smoothed[band] = this.bands[band] * 0.62 + prev * 0.19 + next * 0.19;
    }
    for (let band = 0; band < BAND_COUNT; band++) this.bands[band] = 0.035 + this.smoothed[band] * 0.965;

    // Lift the frame so the loudest band reaches the rim: music that is all
    // bass would otherwise leave most of a radial preset dead. Deterministic
    // per frame, so preview and export see exactly the same shape.
    let loudest = 0;
    for (let band = 0; band < BAND_COUNT; band++) if (this.bands[band] > loudest) loudest = this.bands[band];
    if (loudest > 0.02) {
      const gain = 0.92 / Math.max(0.3, loudest);
      for (let band = 0; band < BAND_COUNT; band++) this.bands[band] = Math.min(1, this.bands[band] * gain);
    }
    // Soft knee: lift the quiet bands so a spectrum with one loud region still
    // draws a shape instead of a spike and a row of stubs.
    // Sensitivity: how easily the bars reach the rim. Applied after levelling so
    // it changes the response curve, not the balance between bands.
    if (gain !== 1) {
      for (let band = 0; band < BAND_COUNT; band++) {
        this.bands[band] = Math.min(1, this.bands[band] * gain);
      }
    }

    const block = FFT_SIZE / WAVE_SAMPLES;
    for (let i = 0; i < WAVE_SAMPLES; i++) {
      const start = Math.floor(i * block);
      let sum = 0;
      for (let j = 0; j < block; j++) sum += input[start + j] - mean;
      this.wave[i] = Math.max(-1, Math.min(1, sum / block));
    }

    let bass = 0;
    let mid = 0;
    let treble = 0;
    for (let i = 0; i < 12; i++) bass += this.bands[i];
    for (let i = 12; i < 48; i++) mid += this.bands[i];
    for (let i = 48; i < BAND_COUNT; i++) treble += this.bands[i];
    let power = 0;
    for (let i = 0; i < WAVE_SAMPLES; i++) power += this.wave[i] * this.wave[i];

    this.frame.t = time;
    this.frame.bass = bass / 12;
    this.frame.mid = mid / 36;
    this.frame.treble = treble / (BAND_COUNT - 48);
    this.frame.energy = Math.min(1, Math.sqrt(power / WAVE_SAMPLES) * 2.4);
    return this.frame;
  }

  private lastRate = -1;
}
