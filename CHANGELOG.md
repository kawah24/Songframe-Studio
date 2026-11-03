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

## 1.7.5 — 2026-10-30

- **Bold on/off for lyrics.** The lyric panel gained a `Bold` checkbox next to
  "Show section lines". Lyric type was hard-coded to 700; it now uses 400 when
  the box is cleared, across all three styles, and the row-fitting measure uses
  the same weight so wrapped lines stay correct.
- Saved looks from older versions still render bold, since an absent field means
  bold — the historical look is unchanged.

## 1.7.6 — 2026-11-02

- **"Clean" is actually clean now.** The Minimal preset drew two things it never
  advertised: a waveform hairline 5.5 % above the bottom edge and a full-width
  progress bar 2 % above it. With a video background those read as a stray wave
  under the picture. Both are gone; the preset now draws nothing at all, and
  particles, backdrop and type carry the frame on their own.
- Tests: *clean preset draws nothing but the backdrop* (a solid-background frame
  must be a single colour) and *clean preset still draws particles*. The opacity
  sweep now lists only presets that draw something, since an empty preset cannot
  respond to opacity.

## 1.7.7 — 2026-11-03

- **The background drift has a speed control.** The slow zoom over the backdrop
  was a hard-coded rate: about 57 s per cycle on generated and pattern
  backgrounds, about 35 s on photo and video. It now reads `zoomSpeed` (0–4x,
  default 1x), exposed as a **Zoom speed** slider under Background, next to
  Dimming. At 0 the drift stops and the 1.06 base scale is dropped, so the frame
  is shown uncropped; saved looks without the field keep the historical rate.
- Tests: *a fixed time renders the same frame*, *zoom speed changes the
  background drift*, *zoom speed 0 freezes the drift*, and the slider reading
  `Off / 1x / 4x`.

## 1.7.8 — 2026-11-03

- **Pixabay photos come in at the best resolution the key allows.** The search
  asked for `largeImageURL` alone, which Pixabay caps at 1280 px, so every photo
  background was upscaled 1.5x for a 1080p frame and about 2.4x when cropped for
  9:16. The chain is now `imageURL` (the original, full resolution) →
  `fullHDURL` (1920) → `largeImageURL` (1280) → `webformatURL`. The first
  two are only returned to accounts approved for Pixabay's full API access, so a
  standard key still lands on 1280 — the difference is that the app no longer
  throws the better file away when it is offered.
- **The caption no longer lies about the size.** Width and height came from
  `imageWidth`/`imageHeight`, which describe the *original*; the grid printed
  4000×2250 over a 1280 px file. The caption now reports the rendition that is
  actually linked, capped at 1920 or 1280 as appropriate.
- **Photo and video backdrops are downscaled with `imageSmoothingQuality: high`.**
  Canvas defaults to `low`, a cheap filter that visibly softens a large photo
  once it is fitted to the frame. Preview and export share the draw path, so both
  benefit; `restore()` returns the context to its previous state.

## 1.7.9 — 2026-11-03

- **The source page is one click away.** Under “Picture ready.” the sidebar now
  prints the full page URL of the selected background, whether it came from
  Pixabay or Wikimedia Commons, and opens it in the system browser. A standard
  Pixabay key only yields 1280 px, so the page is the one place to fetch the
  untouched original — the app no longer dead-ends at the rendition it could get.
- The desktop shell gained open_url, so these links never load inside the
  webview: only http(s) is accepted and anything else is refused.


## 1.8.0 — 2026-11-03

- **Watermark.** Style → Watermark takes a logo or a wordmark image and draws it
  over the finished frame, above the type and the credit, so effects and layout
  never move it. Size (3–40 % of the frame's short side), opacity (0–100 %) and
  the corner are controls, and all three travel in saved looks; dropping the
  opacity to 0 hides the mark without forgetting the file.
- The mark scales off the short side, so the same 12 % reads the same in 16:9 and
  9:16, and it is drawn with high-quality filtering so a large PNG stays crisp
  when shrunk.
- Tests: *watermark size slider is listed* and *watermark size, opacity and
  corner reach the config*.


## 1.8.1 — 2026-11-03

- **Video quality shows its percentage, and the file size before you render.**
  The readout used to say *Balanced* and nothing else; it now reads
  `125% · High`, and a second line under the slider estimates the MP4:
  `Estimated file: ~86 MB (245 s)`. The estimate uses the very bitrates the
  encoder is configured with (`width × height × fps × 0.12 × quality`, plus the
  audio bitrate) over the seconds the render range actually covers, so it moves
  with quality, audio bitrate, resolution, frame rate, From/To and the song.
- Tests: *video quality reads as a percentage* and *file size estimate is shown
  once a song is loaded*.


## 1.8.2 — 2026-11-03

- **Captions wrap at half the frame.** The wrap width was 88 % of the picture, so
  a sung line ran almost edge to edge and broke wherever it happened to. It is
  now 50 %, in all three styles (lines, karaoke, scroll), which is what a subtitle
  block is supposed to look like next to a full-bleed photo.
- **Sound cues are not sung.** `[Music]`, `(Applause)`, `【掌声】` — a whole cue
  that is only a bracketed aside — is dropped when the lyrics are parsed, from
  pasted plain text and from SRT alike. Bracketed asides inside a real line
  ("hello [laughs] there") are stripped, the words kept. Real section markers
  ("[Verse 1]") survive, so the section feature still works.
- Tests: *a [Music] cue is dropped from the lyrics* (pastes a cue plus a line,
  expects one lyric line).

## 1.8.3 — 2026-11-03

- **“Visible lines” counts drawn rows now, not cues.** It capped how many lyric
  *lines* were stacked, so one long cue wrapped into two rows while the setting
  still read 1 — exactly what a 50 % wrap width makes easy to hit. It is a row
  budget: at 1 you get a single row, at 2 the active cue may use two rows or one
  row plus the next cue, and so on. Karaoke obeys the same budget.
- A cue that cannot fit the budget even at the smallest type is trimmed with an
  ellipsis instead of silently growing past the setting.

## 1.8.4 — 2026-11-03

- **Long cues are split, not shrunk and never clipped.** A cue longer than
  **Words per line** (new slider, 3–16, default 8) is cut into several cues,
  each getting a share of the original time by character count. Eight words at
  50 % width read at full size, so nothing has to shrink to 40 % or lose its
  tail to an ellipsis.
- The ellipsis is gone entirely: if a cue still needs a second row at the
  smallest size, it gets one. Hiding words was worse than a taller block.
- Changing the slider re-cuts the lyrics already in the box.
- Tests: *long cues are split into ~8-word lines* (18 words → 3 cues).

## 1.8.5 - 2026-11-03

- **Text opacity for lyrics.** A new slider above *Pill opacity*, 0-100 %, default
  100 %. It fades the letters, their drop shadow and the glow together, so a
  caption can sit back over a bright photo without changing its colour; the pill
  keeps its own separate opacity. Zero means the words are gone while the timing
  and styles stay intact.
- Tests: *lyrics have a text opacity slider* (the slider writes 0.4 and reads
  back `40 %`) and *lyric text opacity fades the type* (peak glyph brightness
  255 -> 92 at 35 %, and no lit pixels at 0).

## 1.8.6 - 2026-11-03

- **The 85-90 % range is one click away.** Under *Text opacity* there are now four
  stops - 100 %, 90 %, 85 %, 80 % - and the active one lights up, so a caption can
  be dropped to the 85-90 % blend that folk and country footage wants without
  fishing for the value with the slider. The slider still moves in 1 % steps
  between them, and the stops travel in saved looks like any other setting.
- Tests: *text opacity offers 90, 85 and 80 percent stops* (each stop clicks,
  writes 0.9 / 0.85 / 0.8, and reads back `85 %` with the chip lit).
