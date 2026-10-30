import { drawGeneratedBackground } from './backgrounds';
import { creditLine, searchCommons, searchPixabay, suggestScenes, type MediaItem } from './media';

export const PATTERN_NAMES = [
  'Aurora',
  'Dusk',
  'Spotlight',
  'Mesh',
  'Waves',
  'Rings',
  'Grid',
  'Bokeh',
  'Streaks',
  'Prism',
  'Horizon',
  'Clouds',
];

export type MediaTarget = 'background' | 'center';

export interface MediaPickerOptions {
  songTitle: () => string;
  paletteName: () => string;
  primary: () => string;
  secondary: () => string;
  onPhoto: (item: MediaItem, target: MediaTarget) => void | Promise<void>;
  onVideo: (item: MediaItem, target: MediaTarget) => void | Promise<void>;
  onPattern: (index: number) => void;
  onFile: (kind: 'image' | 'video') => void;
}

type Tab = 'photo' | 'video' | 'pattern';

const ICON_IMAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>';

export function createMediaPicker(options: MediaPickerOptions): { open: (tab?: Tab, target?: MediaTarget) => void } {
  const host = document.createElement('div');
  host.className = 'modal media';
  host.id = 'mediaModal';
  host.hidden = true;
  host.innerHTML = `
    <div class="media-card" role="dialog" aria-modal="true" aria-labelledby="mediaTitle">
      <header class="media-head">
        <span class="media-icon">${ICON_IMAGE}</span>
        <h2 id="mediaTitle">Select background</h2>
        <button class="btn icon" type="button" data-act="close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>

      <div class="media-preview" id="mediaPreview"><span>Choose a picture or a clip below.</span></div>
      <div class="media-caption" id="mediaCaption"></div>

      <div class="media-bar">
        <div class="seg tight media-tabs" id="mediaTabs"></div>
        <div class="seg tight media-provider" id="mediaProvider"></div>
        <button class="btn ghost small" type="button" data-act="file">Use an image or video file</button>
      </div>

      <div class="media-search">
        <input id="mediaQuery" type="search" placeholder="rain window" autocomplete="off" />
        <button class="btn primary small" type="button" data-act="search">Search</button>
      </div>
      <div class="media-chips" id="mediaChips"></div>

      <div class="media-grid" id="mediaGrid"></div>

      <footer class="media-foot">
        <span class="media-note" id="mediaNote">Free pictures and clips from Wikimedia Commons. Credit is kept with your video.</span>
        <div class="media-actions">
          <button class="btn ghost small" type="button" data-act="close">Cancel</button>
          <button class="btn primary small" type="button" data-act="use" disabled>Use this background</button>
        </div>
      </footer>
    </div>`;

  document.body.appendChild(host);

  const $ = <T extends Element>(selector: string): T => host.querySelector(selector) as unknown as T;
  const preview = $<HTMLElement>('#mediaPreview');
  const caption = $<HTMLElement>('#mediaCaption');
  const tabsHost = $<HTMLElement>('#mediaTabs');
  const grid = $<HTMLElement>('#mediaGrid');
  const chips = $<HTMLElement>('#mediaChips');
  const note = $<HTMLElement>('#mediaNote');
  const searchRow = $<HTMLElement>('.media-search');
  const providerHost = $<HTMLElement>('#mediaProvider');
  const queryInput = $('#mediaQuery') as HTMLInputElement;
  const useButton = host.querySelector('[data-act="use"]') as HTMLButtonElement;

  let tab: Tab = 'photo';
  let target: MediaTarget = 'background';
  let selected: MediaItem | null = null;
  let controller: AbortController | null = null;
  let searchedFor = '';

  type Provider = 'commons' | 'pixabay';
  const PIXABAY_KEY = 'songframe.pixabayKey';
  let provider: Provider = 'commons';
  let pixabayKey = '';
  try {
    pixabayKey = localStorage.getItem(PIXABAY_KEY) ?? '';
  } catch {
    pixabayKey = '';
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'photo', label: 'Photos' },
    { id: 'video', label: 'Videos' },
    { id: 'pattern', label: 'Patterns' },
  ];

  function renderTabs(): void {
    tabsHost.innerHTML = '';
    // A centre image is a still: photos only, no clips and no patterns.
    const visible = target === 'center' ? TABS.filter((entry) => entry.id === 'photo') : TABS;
    for (const entry of visible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.dataset.tab = entry.id;
      if (entry.id === tab) button.classList.add('is-active');
      button.addEventListener('click', () => void setTab(entry.id));
      tabsHost.appendChild(button);
    }
  }

  function renderChips(): void {
    const ideas = suggestScenes(options.songTitle(), options.paletteName());
    chips.innerHTML = '<span class="media-chips-label">For this track</span>';
    for (const idea of ideas) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip-btn';
      button.textContent = idea;
      button.addEventListener('click', () => {
        queryInput.value = idea;
        void runSearch(idea);
      });
      chips.appendChild(button);
    }
  }

  function setNote(text: string, tone: 'normal' | 'warn' = 'normal'): void {
    note.textContent = text;
    note.classList.toggle('is-warn', tone === 'warn');
  }

  function clearPreview(): void {
    selected = null;
    preview.style.backgroundImage = '';
    preview.classList.remove('has-media');
    preview.innerHTML = '<span>Choose a picture or a clip below.</span>';
    caption.textContent = '';
    useButton.disabled = true;
  }

  function select(item: MediaItem): void {
    selected = item;
    preview.classList.add('has-media');
    preview.innerHTML = '';
    preview.style.backgroundImage = `url("${item.kind === 'video' ? item.thumb : item.full}")`;
    if (item.kind === 'video') {
      const badge = document.createElement('span');
      badge.className = 'media-badge';
      badge.textContent = 'video';
      preview.appendChild(badge);
    }
    caption.textContent = `${item.title} · ${item.width}×${item.height} · ${creditLine(item)}`;
    useButton.disabled = false;
    grid.querySelectorAll<HTMLElement>('.media-tile').forEach((tile) => {
      tile.classList.toggle('is-selected', tile.dataset.id === String(item.id));
    });
  }

  function skeleton(): void {
    grid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const tile = document.createElement('div');
      tile.className = 'media-tile skeleton';
      grid.appendChild(tile);
    }
  }

  function renderProvider(): void {
    providerHost.innerHTML = '';
    const sources: { id: Provider; label: string; title: string }[] = [
      { id: 'commons', label: 'Commons', title: 'Wikimedia Commons — free, no key needed' },
      { id: 'pixabay', label: 'Pixabay', title: 'Pixabay — needs a free API key' },
    ];
    for (const entry of sources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.title = entry.title;
      if (entry.id === provider) button.classList.add('is-active');
      button.addEventListener('click', () => {
        if (provider === entry.id) return;
        provider = entry.id;
        renderProvider();
        void runSearch(queryInput.value);
      });
      providerHost.appendChild(button);
    }
    providerHost.hidden = tab === 'pattern';
  }

  function renderKeyCard(problem?: string): void {
    grid.innerHTML = `
      <div class="media-key">
        <h3>Pixabay needs a free API key</h3>
        <p>Make one in a minute on Pixabay's API page, paste it here, and it stays on this machine.</p>
        ${problem ? `<p class="media-key-problem">${problem}</p>` : ''}
        <div class="media-key-row">
          <input id="pixabayKeyInput" type="text" placeholder="12345678-1234abcd" spellcheck="false" />
          <button class="btn primary small" type="button" data-act="save-key">Save key</button>
        </div>
        <p class="media-key-note">Only the search needs the key — photos and clips load straight from Pixabay's CDN.</p>
        <a class="media-key-link" href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer">Open Pixabay's API page</a>
      </div>`;

    const input = grid.querySelector<HTMLInputElement>('#pixabayKeyInput');
    if (!input) return;
    input.value = pixabayKey;
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      storeKey(input.value);
      if (pixabayKey) void runSearch(queryInput.value);
    });
    input.focus();
  }

  function storeKey(value: string): void {
    pixabayKey = value.trim();
    try {
      localStorage.setItem(PIXABAY_KEY, pixabayKey);
    } catch {
      /* private mode: the key lives for this session only */
    }
  }

  async function runSearch(query: string): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    searchedFor = query;
    selected = null;
    useButton.disabled = true;
    clearPreview();
    renderProvider();
    skeleton();

    if (provider === 'pixabay' && !pixabayKey.trim()) {
      renderKeyCard();
      setNote('Pixabay needs a free API key — Commons works without one.');
      return;
    }

    setNote(provider === 'pixabay' ? 'Searching Pixabay' : 'Searching Wikimedia Commons');
    try {
      const found = provider === 'pixabay'
        ? await searchPixabay(query, tab === 'video' ? 'video' : 'photo', pixabayKey, 24, controller.signal)
        : await searchCommons(query, tab === 'video' ? 'video' : 'photo', 24, controller.signal);
      if (controller?.signal.aborted) return;
      grid.innerHTML = '';
      if (found.length === 0) {
        grid.innerHTML = `<p class="media-empty">Nothing found for that search. Try another phrase, or switch to Patterns.</p>`;
        setNote('No results. Patterns work offline.', 'warn');
        return;
      }
      for (const item of found) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'media-tile';
        tile.dataset.id = String(item.id);
        tile.title = `${item.title} — ${creditLine(item)}`;
        const image = document.createElement('img');
        image.className = 'media-thumb';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.alt = '';
        image.addEventListener('load', () => image.classList.add('is-loaded'), { once: true });
        image.src = item.thumb;
        tile.appendChild(image);
        if (item.kind === 'video') {
          const badge = document.createElement('span');
          badge.className = 'media-badge';
          badge.textContent = 'video';
          tile.appendChild(badge);
        }
        tile.addEventListener('click', () => select(item));
        tile.addEventListener('dblclick', () => {
          select(item);
          apply();
        });
        grid.appendChild(tile);
      }
      setNote(
        provider === 'pixabay'
          ? 'Photos and clips from Pixabay. Credit is kept with your video.'
          : 'Free pictures and clips from Wikimedia Commons. Credit is kept with your video.',
      );
    } catch (error) {
      if (controller?.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      if (provider === 'pixabay' && /key/i.test(message)) {
        renderKeyCard(message);
        setNote('That key was refused.', 'warn');
        return;
      }
      const label = provider === 'pixabay' ? 'Pixabay' : 'Wikimedia Commons';
      grid.innerHTML = `<p class="media-empty">Could not reach ${label}. Patterns work without a connection.</p>`;
      setNote(`No connection to ${label} — Patterns and files still work.`, 'warn');
      console.warn('[songframe] media search failed', error);
    }
  }

  function renderPatterns(): void {
    controller?.abort();
    clearPreview();
    grid.innerHTML = '';
    const primary = options.primary();
    const secondary = options.secondary();

    PATTERN_NAMES.forEach((name, index) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'media-tile pattern-tile';
      tile.title = name;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(160, 90);
        ctx.scale(180 / 1080, 180 / 1080);
        drawGeneratedBackground(ctx, 1920, 1080, 0, index + 7, primary, secondary, index);
      }
      const label = document.createElement('span');
      label.className = 'pattern-name';
      label.textContent = name;
      tile.append(canvas, label);
      tile.addEventListener('click', () => {
        options.onPattern(index);
        close();
      });
      grid.appendChild(tile);
    });
    setNote('Patterns are drawn on your machine — they work offline and export at full resolution.');
  }

  async function setTab(next: Tab): Promise<void> {
    tab = next;
    renderTabs();
    // Searching makes no sense for the built-in patterns.
    searchRow.hidden = tab === 'pattern';
    chips.hidden = tab === 'pattern';
    providerHost.hidden = tab === 'pattern';
    if (tab === 'pattern') {
      renderPatterns();
      return;
    }
    const fallback = suggestScenes(options.songTitle(), options.paletteName())[0] ?? 'abstract light';
    await runSearch(queryInput.value.trim() || searchedFor || fallback);
  }

  function apply(): void {
    if (!selected) return;
    if (selected.kind === 'video') void options.onVideo(selected, target);
    else void options.onPhoto(selected, target);
    close();
  }

  function close(): void {
    controller?.abort();
    host.hidden = true;
    document.body.classList.remove('is-modal');
  }

  function open(next: Tab = 'photo', nextTarget: MediaTarget = 'background'): void {
    host.hidden = false;
    document.body.classList.add('is-modal');
    target = nextTarget;
    tab = target === 'center' ? 'photo' : next;
    const heading = host.querySelector<HTMLElement>('#mediaTitle');
    if (heading) heading.textContent = target === 'center' ? 'Select centre image' : 'Select background';
    useButton.textContent = target === 'center' ? 'Use this image' : 'Use this background';
    const fileButton = host.querySelector<HTMLElement>('[data-act="file"]');
    if (fileButton) fileButton.textContent = target === 'center' ? 'Use an image file' : 'Use an image or video file';
    renderTabs();
    searchRow.hidden = tab === 'pattern';
    chips.hidden = tab === 'pattern';
    renderProvider();
    renderChips();
    clearPreview();
    const ideas = suggestScenes(options.songTitle(), options.paletteName());
    queryInput.value = ideas[0] ?? 'abstract light';
    if (tab === 'pattern') {
      renderPatterns();
    } else {
      void runSearch(queryInput.value);
    }
    setTimeout(() => queryInput.focus(), 60);
  }

  host.addEventListener('click', (event) => {
    if (event.target === host) {
      close();
      return;
    }
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!action) return;
    if (action === 'close') close();
    if (action === 'use') apply();
    if (action === 'search') void runSearch(queryInput.value);
    if (action === 'file') {
      close();
      options.onFile(tab === 'video' ? 'video' : 'image');
    }
    if (action === 'save-key') {
      const input = host.querySelector<HTMLInputElement>('#pixabayKeyInput');
      if (input) {
        storeKey(input.value);
        if (pixabayKey) void runSearch(queryInput.value);
      }
    }
  });

  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runSearch(queryInput.value);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !host.hidden) close();
  });

  return { open };
}
