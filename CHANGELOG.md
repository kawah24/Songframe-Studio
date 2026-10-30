# Changelog

## 1.0.0 — 2026-10-30

First milestone. A standalone song-to-video studio: upload a track, design the
look, render an MP4 — no server, no account, no network except the optional
stock-photo library.

### Rendering

- 13 visualizer presets: Classic NCS, Spectrum, Mirror, Shockwave, Orbital,
  Hex Core, Analog, Matrix, Pulse, Clean, Waveform, Vinyl, Lyrics.
- Per-preset response controls: sensitivity (50–200%), bar count (16–128),
  visualizer size and opacity.
- H.264 + AAC MP4 via WebCodecs and `mp4-muxer`, with a real-time
  `MediaRecorder` fallback and an honest label for its output format.
- Render range (from/to, or "start at the playhead") trims picture and audio
  together; a 1 s range produces a 1 s file.
- 16:9 / 9:16 / 1:1 at 1080p / 720p / 480p, 24 / 30 / 60 fps, 128–320 kbps audio.
- Single-frame PNG export and reusable "look" JSON files.

### Design

- Ten palettes plus custom colours; procedural, pattern, photo and video
  backgrounds; dimming; particles; centre artwork.
- Background library: Wikimedia Commons search, optional Pixabay (free API key),
  and 12 generated patterns that work offline. Licences and authors are kept and
  written into the corner of the frame.
- Text layers with any installed system font (the desktop shell enumerates all
  of them — 676 on the reference machine), dragged on the canvas.
- Lyrics: LRC with word timings, or pasted text distributed across the song;
  karaoke / lines / scroll styles with offset, colours and pill opacity.
- 13 stackable effects with per-effect intensity.

### Application

- Windows desktop app (Python + pywebview/WebView2), packaged as a single
  `Songframe.exe`, with native Save dialogs, cross-drive safe writes, a window
  title that follows the song, and one-click "show in folder".
- Chrome themes for the studio chrome: Songframe, Brandl, Sunset, Ocean, Mono.
- Eject (load another song, keep the look) and Reset all, both confirmed.
- Single-file browser build (`songframe.html`) for anything Chromium.

### Verification at this milestone

- `npm run typecheck` — clean.
- `npm run smoke` — 13 presets, 3 aspect ratios, LRC, 480p/9:16/range exports
  probed with ffprobe, no console errors.
- `npm run ui-test` — 30 interface assertions (presets, drag, text, opacity,
  fonts, theme, eject, reset).
- `node tools/media-test.mjs` — 24 Commons photos, apply, credit, export; centre
  image from the library.
- `node tools/media-video-test.mjs` — clip search, apply, export, and a check
  that two exported frames a second apart actually differ.
- `Songframe.exe --selftest` — 7/7: UI, bridge, chunked save, MP4 render inside
  WebView2, Commons lookup, font enumeration (676), font menu (660).

### Known limits

- Chromium desktop only for the browser build; Firefox/Safari take the
  real-time recorder path.
- Pixabay needs a free API key; Commons does not.
- Background video is re-seeked per exported frame, which is correct but slower
  than a still image.
- The executable is unsigned; Windows SmartScreen warns on first launch.

## 1.1.0 — 2026-10-30

- **Halo** preset: a rainbow spectrum ring drawn in perspective — bars rising
  from a foreshortened ellipse, with a sunburst floor and a dark well in the
  middle. Responds to bar count, sensitivity and opacity like the others.
- **SubRip (.srt) lyrics.** Cue start *and* end times are used, so karaoke
  progress follows the actual cue length instead of the gap to the next line.
  LRC, SRT and plain text are detected automatically; multi-line cues are joined
  and styling tags stripped.

## 1.2.0 — 2026-10-30

- **Lyrics font.** The lyric renderer had its font hardcoded; it now has its own
  font menu, using the same installed-font list as the text layers and saved
  with the look.
- **Remove and Reset in Lyrics.** *Remove* unloads the lyrics and clears the text
  box. *Reset* restores the lyric styling (font, size, position, colours, pill,
  offset, visible lines) without discarding the lyrics you just loaded.

## 1.2.1 — 2026-10-30

- **Dark dropdown lists.** The font menu opened as a light grey list with white
  text in the desktop window, because the popup is painted by the host and had
  no option colours. Options now carry an explicit dark background and light
  text, so every menu matches the app.

## 1.2.2 — 2026-10-30

- **Halo follows the palette.** The ring was painted from a fixed hue wheel, so
  primary and secondary had no effect on it. The hue now sweeps from the primary
  colour to the secondary and back around the circle, and the sunburst picks up
  the same tint.
