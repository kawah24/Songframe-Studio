/**
 * Wikimedia Commons lookup: photographs and clips that are free to reuse, with
 * the licence and author kept so the credit can travel with the video.
 */

export type MediaSource = 'commons' | 'pixabay';

export interface MediaItem {
  id: number | string;
  title: string;
  kind: 'photo' | 'video';
  source: MediaSource;
  /** Picture for the grid, the preview and the canvas. */
  thumb: string;
  /** What gets drawn (a 1024 px photograph, or a 480/720p transcode). */
  full: string;
  width: number;
  height: number;
  license: string;
  author: string;
  page: string;
}

const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

interface CommonsPage {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsInfo[];
  videoinfo?: CommonsInfo[];
}

interface CommonsDerivative {
  src?: string;
  type?: string;
  width?: number;
  height?: number;
}

interface CommonsInfo {
  url?: string;
  thumburl?: string;
  width?: number;
  height?: number;
  mime?: string;
  derivatives?: CommonsDerivative[];
  extmetadata?: Record<string, { value?: string }>;
}

function clean(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortTitle(title: string): string {
  return title.replace(/^File:/i, '').replace(/\.(jpg|jpeg|png|gif|webp|tif|tiff|webm|ogv|mp4)$/i, '').replace(/_/g, ' ');
}

export async function searchCommons(
  query: string,
  kind: 'photo' | 'video',
  limit = 24,
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  const trimmed = query.trim() || 'abstract light';
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `filetype:${kind === 'photo' ? 'bitmap' : 'video'} ${trimmed}`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: kind === 'photo' ? 'imageinfo' : 'videoinfo',
  });
  if (kind === 'photo') {
    params.set('iiprop', 'url|extmetadata|size');
    params.set('iiurlwidth', '640');
  } else {
    params.set('viprop', 'url|derivatives|size|extmetadata');
    params.set('viurlwidth', '480');
  }

  const response = await fetch(`${ENDPOINT}?${params.toString()}`, { signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`Commons answered ${response.status}`);
  const data = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = data.query?.pages ?? {};
  const items: MediaItem[] = [];

  for (const page of Object.values(pages)) {
    const info = (kind === 'photo' ? page.imageinfo : page.videoinfo)?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    let full = info.thumburl ?? info.url ?? '';
    let width = info.width ?? 0;
    let height = info.height ?? 0;

    if (kind === 'video') {
      const webm = (info.derivatives ?? []).filter((entry) => String(entry.type ?? '').includes('webm') && entry.src);
      const pick =
        webm.find((entry) => (entry.height ?? 0) >= 540 && (entry.height ?? 0) <= 720) ??
        webm.find((entry) => (entry.height ?? 0) >= 360) ??
        webm[0];
      if (!pick?.src) continue;
      full = pick.src;
      width = pick.width ?? 0;
      height = pick.height ?? 0;
    }

    if (!full) continue;
    if (kind === 'photo' && (width < 700 || height < 500)) continue;

    const thumb = info.thumburl ?? full;
    items.push({
      id: page.pageid ?? items.length,
      title: shortTitle(page.title ?? 'Untitled'),
      kind,
      source: 'commons',
      thumb,
      full,
      width,
      height,
      license: clean(meta.LicenseShortName?.value) || (kind === 'video' ? 'Wikimedia Commons' : 'Free licence'),
      author: clean(meta.Artist?.value) || 'Wikimedia Commons',
      page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
    });
  }
  return items;
}

/** A short credit line for the frame, e.g. "W.carter · CC BY-SA 4.0". */
/**
 * A larger copy of the picture, fetched only when the user actually picks it:
 * the grid stays light, the exported frame stays sharp.
 */
export async function resolveFullSize(item: MediaItem, width = 1600): Promise<string> {
  if (item.kind === 'video') return item.full;
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      titles: `File:${item.title}`,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(width),
    });
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return item.thumb;
    const data = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const page = Object.values(data.query?.pages ?? {})[0];
    return page?.imageinfo?.[0]?.thumburl ?? item.thumb;
  } catch {
    return item.thumb;
  }
}

export function creditLine(item: MediaItem): string {
  const author = item.author.length > 46 ? `${item.author.slice(0, 43)}…` : item.author;
  if (item.source === 'pixabay') return `${author} · Pixabay`;
  return `${author} · ${item.license} · Wikimedia Commons`;
}

/* ------------------------------------------------------------------ *
 * Pixabay
 * ------------------------------------------------------------------ */

const PIXABAY_PHOTOS = 'https://pixabay.com/api/';
const PIXABAY_VIDEOS = 'https://pixabay.com/api/videos/';

interface PixabayVideo {
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}

interface PixabayHit {
  id?: number;
  pageURL?: string;
  tags?: string;
  user?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  videos?: Record<string, PixabayVideo>;
}

/**
 * Pixabay needs a free API key (their terms, not ours). Photos are offered at
 * 1280 px and clips at 1280×720, both of which the CDN serves with CORS.
 */
export async function searchPixabay(
  query: string,
  kind: 'photo' | 'video',
  key: string,
  limit = 24,
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  if (!key.trim()) throw new Error('Pixabay needs an API key.');
  const params = new URLSearchParams({
    key: key.trim(),
    q: query.trim() || 'abstract',
    per_page: String(Math.min(200, limit)),
    page: '1',
    safesearch: 'true',
  });
  if (kind === 'photo') params.set('image_type', 'photo');

  const response = await fetch(`${kind === 'photo' ? PIXABAY_PHOTOS : PIXABAY_VIDEOS}?${params.toString()}`, {
    signal,
    mode: 'cors',
    credentials: 'omit',
  });
  if (response.status === 400) {
    throw new Error('Pixabay refused that API key. Copy it again from pixabay.com/api/docs/.');
  }
  if (response.status === 429) {
    throw new Error('Pixabay is rate-limiting this key — wait a minute and try again.');
  }
  if (!response.ok) throw new Error(`Pixabay answered ${response.status}.`);

  const data = (await response.json()) as { hits?: PixabayHit[] };
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const items: MediaItem[] = [];

  for (const hit of hits) {
    const author = (hit.user ?? 'Pixabay contributor').trim();
    const title = (hit.tags ?? 'Pixabay media').split(',').slice(0, 3).join(', ').trim();

    if (kind === 'photo') {
      const full = hit.largeImageURL ?? hit.webformatURL;
      const thumb = hit.webformatURL ?? hit.previewURL;
      if (!full || !thumb) continue;
      items.push({
        id: hit.id ?? items.length,
        title: title || 'Pixabay photo',
        kind: 'photo',
        source: 'pixabay',
        thumb,
        full,
        width: hit.imageWidth ?? 0,
        height: hit.imageHeight ?? 0,
        license: 'Pixabay Content License',
        author,
        page: hit.pageURL ?? 'https://pixabay.com/',
      });
    } else {
      const videos = hit.videos ?? {};
      const pick = videos.large?.url
        ? videos.large
        : videos.medium?.url
          ? videos.medium
          : videos.small?.url
            ? videos.small
            : videos.tiny;
      if (!pick?.url) continue;
      const poster = videos.large?.thumbnail ?? videos.medium?.thumbnail ?? videos.small?.thumbnail ?? videos.tiny?.thumbnail;
      if (!poster) continue;
      items.push({
        id: hit.id ?? items.length,
        title: title || 'Pixabay clip',
        kind: 'video',
        source: 'pixabay',
        thumb: poster,
        full: pick.url,
        width: pick.width ?? 0,
        height: pick.height ?? 0,
        license: 'Pixabay Content License',
        author,
        page: hit.pageURL ?? 'https://pixabay.com/',
      });
    }
  }
  return items;
}

const SCENES: { words: string[]; scenes: string[] }[] = [
  { words: ['rain', 'storm', 'wet'], scenes: ['rain window', 'rain street'] },
  { words: ['night', 'midnight', 'moon'], scenes: ['city night', 'night lights'] },
  { words: ['city', 'urban', 'street', 'drive'], scenes: ['city night', 'street lights'] },
  { words: ['ocean', 'sea', 'wave', 'water'], scenes: ['ocean waves', 'underwater'] },
  { words: ['forest', 'wood', 'tree'], scenes: ['forest fog', 'green forest'] },
  { words: ['mountain', 'peak', 'alps'], scenes: ['mountains clouds', 'misty mountains'] },
  { words: ['sun', 'summer', 'warm', 'fire'], scenes: ['sunset sky', 'golden light'] },
  { words: ['snow', 'winter', 'ice', 'cold'], scenes: ['snowfall', 'winter forest'] },
  { words: ['space', 'star', 'cosmic'], scenes: ['space nebula', 'starry sky'] },
  { words: ['smoke', 'fog', 'haze'], scenes: ['smoke dark', 'fog lights'] },
];

/** Three searches worth trying for this track, from its name and its palette. */
export function suggestScenes(title: string, paletteName: string): string[] {
  const name = title.toLowerCase();
  const hits: string[] = [];
  for (const entry of SCENES) {
    if (entry.words.some((word) => name.includes(word))) hits.push(entry.scenes[0]);
  }
  const byMood: Record<string, string[]> = {
    'Neon Pink': ['neon lights', 'city night'],
    'Cyber Blue': ['blue light', 'night city'],
    Sunset: ['sunset sky', 'desert'],
    Matrix: ['green forest', 'fog'],
    Fire: ['fire sparks', 'red light'],
    Ocean: ['ocean waves', 'water'],
    Violet: ['abstract light', 'smoke purple'],
    Gold: ['golden light', 'sunset'],
    Ice: ['snow ice', 'blue ice'],
    Mono: ['black and white', 'fog'],
  };
  const mood = byMood[paletteName] ?? ['abstract light'];
  return Array.from(new Set([...hits, ...mood, 'abstract light'])).slice(0, 3);
}
