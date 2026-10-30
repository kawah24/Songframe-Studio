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

## 1.3.0 — 2026-10-30

- **Long lyric lines now fit.** A line wider than 88% of the frame is wrapped at
  a word boundary onto extra rows, and only a single word that still cannot fit
  shrinks the type. The karaoke sweep runs across the wrap, and the pill follows
  the block.
- **Halo opens towards the viewer.** The near half of the rim carries no bars any
  more, so the ring reads as an aperture instead of a closed drum; the near edge
  is drawn as a thin rim and the floor fan sits under it. A shadow left over from
  the text pass no longer blurs the ring into a grey saucer.

## 1.3.1 — 2026-10-30

- **Halo is a full spectrum again.** The ring runs through every hue twice (so
  the visible back arc carries the whole wheel), anchored at the primary colour;
  the secondary tints the floor fan. Two-tone palettes no longer flatten it.

## 1.4.0 — 2026-10-30

- **Halo back to the first design.** The 1.1.0 look is restored: a closed
  rainbow ring seen in perspective, bars standing all the way round, a sunburst
  floor and a dark well in the middle. The palette experiments (two-tone sweep,
  open aperture, palette-driven hue) are gone, and with them the `hexToHsl`
  helper. The preset keeps its own spectrum, so primary/secondary do not change
  it — that is what the original did.

## 1.5.0 — 2026-10-30

- **Kick zoom.** The frame punches in on bass hits, up to +16% at full intensity.
- **Kaleidoscope.** Mirrors the frame horizontally; above 50% intensity it mirrors
  vertically too, for four-way symmetry.
- **Light leak.** A warm orange-to-pink flare washed over the picture with the
  track's energy.
- All three sit in the Effects tab with their own intensity slider, and all three
  are deterministic — no random values, so preview and export agree.

## 1.6.0 — 2026-10-30

- **Type sits above the effect stack.** Titles, lyrics and the credit are drawn
  after the effects now, so glitch, pixelate, kaleidoscope and kick zoom no
  longer tear, mirror or scale the lettering. Effects still cover the picture.
- **Drop shadow on type.** Text layers and lyrics use an offset, blurred shadow
  (`0.045em` x, `0.075em` y) instead of a symmetric glow, so they hold up over
  busy footage.

## 1.7.0 — 2026-10-30

- **Glow for text layers and lyrics.** A per-layer *Glow* slider in the Text tab
  and a *Glow* slider in the Lyrics panel paint a coloured halo behind the glyphs
  (0.55em blur at full strength) on top of the drop shadow. Off by default, so
  existing looks render exactly as before. The karaoke sweep glows in the
  highlight colour, the rest in the lyric colour.

## 1.7.1 — 2026-10-30

- **Alignment is relative to the frame.** Clicking Left/Centre/Right now places
  the text box at 6% / 50% / 94% of the frame instead of only changing the anchor
  and leaving the layer wherever it was dragged.
- **Dragging keeps the box inside the frame.** The anchor range is clamped by the
  measured text width, so a long title can no longer be pulled past the edge and
  clipped.
- Hit-testing now measures with the same quoted font stack the renderer uses, so
  clicking a layer in a font with spaces in its name lands on the glyphs.

## 1.7.2 — 2026-10-30

- **Shake is a camera move, and the intensity now matters.** It used to be gated
  on `bass > 0.55` and only translated the visualizer group, so on most tracks the
  slider did nothing at all. The frame now drifts continuously with the music,
  scaled by `bass^1.6`, up to 52px at 1080p and full intensity. The moved frame is
  drawn with a 6% over-scale, so no empty edge can appear.

## 1.7.3 — 2026-10-30

- **Shake moves the centre art, not the whole frame.** 1.7.2 made it a camera
  move on the entire picture; that was the wrong target. The disc and its cover
  image now rattle with the beat (up to 34px and a small tilt), and a pixel diff
  confirms nothing outside the disc changes. The continuous `bass^1.6` response
  from 1.7.2 stays, so the slider is audible at low bass too.

## 1.7.4 — 2026-10-30

- **Lyrics glow is actually visible now.** A single `shadowBlur` of ~0.55× the
  font size is wider than a letter stem, so the light spread out to a peak of
  only 29/255 — and the black drop shadow was then painted on top of it. The
  glow is now four stacked narrow layers, and the drop shadow eases back as the
  glow comes up. Peak halo brightness roughly triples; a pixel count in the
  lyric band goes from 2 057 to 4 492 lit pixels.
- Note the glow follows the **Text** colour. In Karaoke style the swept part of
  the line is painted with **Highlight**, so a pink line with a white glow is the
  expected combination, not a colour bug.
