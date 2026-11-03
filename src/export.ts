import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { frameAt, TARGET_RATE, type Song } from './audio';
import { ASPECTS } from './presets';
import type { Config, LyricLine } from './types';
import { renderFrame, type Assets } from './visualizer';

export interface ExportRequest {
  song: Song;
  config: Config;
  assets: Assets;
  lyrics: LyricLine[];
  /** First and last second to render; 0 / undefined means the whole song. */
  startAt?: number;
  endAt?: number;
  /** Render only the first N seconds; used by the automated smoke test. */
  maxSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (stage: string, fraction: number, detail?: string) => void;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  extension: string;
  width: number;
  height: number;
  duration: number;
  mode: 'webcodecs' | 'mediarecorder';
}

const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);

export function frameSize(config: Config): { width: number; height: number } {
  const aspect = ASPECTS.find((entry) => entry.id === config.aspect) ?? ASPECTS[0];
  const scale = config.height / Math.min(aspect.w, aspect.h);
  return { width: even(aspect.w * scale), height: even(aspect.h * scale) };
}

function bitrateFor(width: number, height: number, fps: number, quality: number): number {
  return Math.round(width * height * fps * 0.12 * Math.max(0.4, quality));
}

/** Seconds the exporter will actually render: the same range rule as exportVideo. */
export function renderSeconds(config: Config, songDuration: number): number {
  if (!songDuration) return 0;
  const start = Math.max(0, Math.min(songDuration - 0.1, config.rangeStart || 0));
  const wantedEnd = config.rangeEnd && config.rangeEnd > start ? config.rangeEnd : songDuration;
  const end = Math.max(start + 0.2, Math.min(songDuration, wantedEnd));
  return Math.max(0.2, end - start);
}

/** Rough file size in MB from the bitrates the encoder is configured with. */
export function estimateSizeMB(config: Config, seconds: number): number {
  if (!seconds) return 0;
  const { width, height } = frameSize(config);
  const videoKbps = bitrateFor(width, height, config.fps, config.quality) / 1000;
  return ((videoKbps + config.audioKbps) * seconds) / 8 / 1024;
}

const abortError = (): DOMException => new DOMException('The render was cancelled.', 'AbortError');

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function drain(encoder: { encodeQueueSize: number }, limit: number): Promise<void> {
  while (encoder.encodeQueueSize > limit) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(Math.max(0, (video.duration || 1) - 0.05), time));
  if (Math.abs(video.currentTime - target) < 0.02) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 4000);
    video.addEventListener('seeked', finish);
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}

async function supportsMp4(config: Config, width: number, height: number): Promise<{ video: string; audio: boolean } | null> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return null;
  const bitrate = bitrateFor(width, height, config.fps, config.quality);
  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
  let video: string | null = null;
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: config.fps });
      if (support.supported) {
        video = codec;
        break;
      }
    } catch {
      /* unsupported codec string */
    }
  }
  if (!video) return null;
  try {
    const audio = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: TARGET_RATE,
      numberOfChannels: 2,
      bitrate: config.audioKbps * 1000,
    });
    if (!audio.supported) return null;
  } catch {
    return null;
  }
  return { video, audio: true };
}

/** Renders one still frame as a PNG at the chosen output size. */
export function exportFrame(song: Song, config: Config, assets: Assets, lyrics: LyricLine[], time: number): Promise<Blob> {
  const { width, height } = frameSize(config);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw a 2D canvas.');
  const frame = frameAt(song, time, config.sensitivity);
  renderFrame(ctx, width, height, { config, frame, assets, lyrics, duration: song.duration, peaks: song.peaks });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The frame could not be saved.'))), 'image/png');
  });
}

export async function exportVideo(request: ExportRequest): Promise<ExportResult> {
  const { song, config, assets, lyrics, signal, onProgress } = request;
  const { width, height } = frameSize(config);
  // A render can start anywhere; timestamps always begin at zero.
  const start = Math.max(0, Math.min(song.duration - 0.1, request.startAt ?? 0));
  const wantedEnd = request.endAt && request.endAt > start ? request.endAt : song.duration;
  const end = Math.max(start + 0.2, Math.min(song.duration, wantedEnd));
  const duration = Math.max(0.2, Math.min(end - start, request.maxSeconds ?? end - start));
  const fps = config.fps;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser cannot draw a 2D canvas.');

  const support = await supportsMp4(config, width, height);
  if (!support) {
    return exportRealtime({ ...request, width, height, duration, canvas, ctx, reason: 'the fast encoder is unavailable' });
  }

  onProgress?.('Preparing', 0.01);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: TARGET_RATE },
    fastStart: 'in-memory',
  });

  let failure: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    },
    error: (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    },
  });
  videoEncoder.configure({
    codec: support.video,
    width,
    height,
    bitrate: bitrateFor(width, height, fps, config.quality),
    framerate: fps,
    latencyMode: 'quality',
  });

  try {
    // The preview player must be still while frames are sought.
    if (config.bg === 'video' && assets.backgroundVideo && !assets.backgroundVideo.paused) {
      assets.backgroundVideo.pause();
    }
    await encodeAudio(song, config, muxer, onProgress, signal, start, start + duration);

    const step = 1 / fps;
    const frameDuration = Math.round(1_000_000 / fps);
    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted(signal);
      if (failure) throw failure;
      const time = start + i * step;
      const frame = frameAt(song, time, config.sensitivity);
      if (config.bg === 'video' && assets.backgroundVideo) await seekVideo(assets.backgroundVideo, time);
      renderFrame(ctx, width, height, { config, frame, assets, lyrics, duration: song.duration, peaks: song.peaks });

      const videoFrame = new VideoFrame(canvas, { timestamp: Math.round(i * 1_000_000 / fps), duration: frameDuration });
      videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
      videoFrame.close();

      if (videoEncoder.encodeQueueSize > 6) await drain(videoEncoder, 5);
      if (i % 3 === 0) {
        onProgress?.('Rendering', 0.2 + (i / totalFrames) * 0.72, `${i + 1} / ${totalFrames} frames`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await videoEncoder.flush();
    if (failure) throw failure;
    onProgress?.('Writing the file', 0.96);
    muxer.finalize();
    const buffer = (muxer.target as ArrayBufferTarget).buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    onProgress?.('Done', 1);
    return { blob, mime: 'video/mp4', extension: 'mp4', width, height, duration, mode: 'webcodecs' };
  } catch (error) {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    throw error;
  }
}

async function encodeAudio(
  song: Song,
  config: Config,
  muxer: Muxer<ArrayBufferTarget>,
  onProgress: ExportRequest['onProgress'],
  signal?: AbortSignal,
  from = 0,
  to = song.duration,
): Promise<void> {
  const left = song.buffer.getChannelData(0);
  const right = song.buffer.numberOfChannels > 1 ? song.buffer.getChannelData(1) : left;
  const startSample = Math.max(0, Math.round(from * TARGET_RATE));
  const endSample = Math.min(left.length, Math.round(to * TARGET_RATE));
  const total = Math.max(0, endSample - startSample);

  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addAudioChunk(chunk, meta);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    },
    error: (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: TARGET_RATE,
    numberOfChannels: 2,
    bitrate: config.audioKbps * 1000,
  });

  const block = 8192;
  for (let offset = 0; offset < total; offset += block) {
    throwIfAborted(signal);
    if (failure) throw failure;
    const count = Math.min(block, total - offset);
    const at = startSample + offset;
    const planar = new Float32Array(count * 2);
    planar.set(left.subarray(at, at + count), 0);
    planar.set(right.subarray(at, at + count), count);
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: TARGET_RATE,
      numberOfFrames: count,
      numberOfChannels: 2,
      timestamp: Math.round((offset / TARGET_RATE) * 1_000_000),
      data: planar,
    });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 8) await drain(encoder, 6);
    if (offset % (block * 24) === 0) {
      onProgress?.('Encoding the audio', 0.03 + (offset / Math.max(1, total)) * 0.15);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}

interface RealtimeRequest extends ExportRequest {
  width: number;
  height: number;
  duration: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  reason: string;
}

/**
 * Real-time fallback: plays the song into a MediaRecorder while drawing to a
 * captured canvas. Slower than the WebCodecs path because it runs at 1x speed.
 */
async function exportRealtime(request: RealtimeRequest): Promise<ExportResult> {
  const { song, config, assets, lyrics, canvas, ctx, duration, width, height, signal, onProgress } = request;
  void request.reason;

  const audioCtx = new AudioContext({ sampleRate: TARGET_RATE });
  const destination = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = song.buffer;
  source.connect(destination);

  const stream = canvas.captureStream(config.fps);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) ?? '';
  if (!mime) throw new Error('This browser cannot record video.');

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: bitrateFor(width, height, config.fps, config.quality),
    audioBitsPerSecond: config.audioKbps * 1000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  onProgress?.('Recording in real time', 0.01);
  await audioCtx.resume();
  recorder.start(1000);
  source.start(0, Math.max(0, request.startAt ?? 0));

  try {
    const startedAt = audioCtx.currentTime;
    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      const tick = () => {
        if (signal?.aborted) {
          cancelAnimationFrame(raf);
          reject(abortError());
          return;
        }
        const elapsed = audioCtx.currentTime - startedAt;
        const t = Math.min(duration, elapsed);
        const frame = frameAt(song, (request.startAt ?? 0) + t, config.sensitivity);
        renderFrame(ctx, width, height, { config, frame, assets, lyrics, duration: song.duration, peaks: song.peaks });
        onProgress?.('Recording in real time', Math.min(0.97, t / duration), `${t.toFixed(1)}s / ${duration.toFixed(1)}s`);
        if (elapsed >= duration) {
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    await audioCtx.close();
  }

  const blob = new Blob(chunks, { type: mime });
  const extension = mime.includes('mp4') ? 'mp4' : 'webm';
  onProgress?.('Done', 1);
  return { blob, mime, extension, width, height, duration, mode: 'mediarecorder' };
}
