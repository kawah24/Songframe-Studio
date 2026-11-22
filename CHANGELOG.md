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

## 1.8.7 - 2026-11-06

- **A real-time render can no longer pass as a normal MP4.** When the fast H.264
  encoder is unavailable, the exporter falls back to MediaRecorder, and that
  output is a *fragmented* MP4: it plays in browsers and QuickTime, but DaVinci
  Resolve and Premiere report "Media Offline" and refuse to decode it. Those
  files now carry a `-realtime` suffix, the result card shows an orange warning
  explaining the limitation, and the toast says so. The ordinary path is
  unchanged.
- The encoder probe also tries High 5.1 and 4.2 before 4.0. 1080p60 needs level
  4.2, and a level-4.0 codec string can be refused by the platform encoder,
  which used to send a perfectly capable machine down the fallback on its own.
- The test API's `lastExport` now reflects the latest render instead of the
  object created at startup.
- Tests: *the fast encoder is used when it is available* and *a real-time render
  is named and flagged* (hides `VideoEncoder`, renders one second, expects
  `songframe-...-480p-realtime.mp4` plus a visible warning).

## 1.8.8 - 2026-11-06

- **Found why so many renders were landing in the real-time encoder.** The Audio
  bitrate choices 256 and 320 kbps made the fast-path probe fail outright:
  Chromium's AAC encoder refuses more than 192 kbps for stereo, and the exporter
  treated "this audio rate is unavailable" as "there is no fast encoder" - so the
  entire render fell back to MediaRecorder and produced the fragmented MP4 that
  DaVinci Resolve cannot open. The audio rate is now negotiated down
  (320 -> 256 -> 192 -> 160 -> 128) and the fast path is kept; the result card
  says "audio capped at 192 kbps" when the encoder caps it.
- Measured on this machine (WebView2, Chrome 156): AAC stereo accepts 96, 128,
  160 and 192 kbps and refuses 256, 320 and 512 at both 48 and 44.1 kHz; all
  H.264 levels down to 4.0 accept 1080p60, and a real 1080p60 configure+encode
  succeeds.
- Tests: *a high audio bitrate is negotiated down instead of falling back*.

## 1.9.0 - 2026-11-06

- **End silence.** A new slider in the Frame pane appends up to 15 s (30 s in a
  look file) of true digital silence after the last note, so a track can end on a
  clean gap and tracklist / chapter boundaries land in empty space. The picture
  keeps running for the same length; the preview still stops with the song, so
  the tail is an export-only setting. 0 leaves the file exactly as before.
- Measured on a 3 s probe song with a 3 s tail: 180 video frames at 30 fps,
  container duration 6.016 s, and ffmpeg `astats` reports a peak and RMS level of
  `-inf dB` from 3.02 s onward - exact zeros, not a fade or a muted track.
- The result card reports `+3 s silence`, the size estimate includes the tail,
  and the WebCodecs / real-time paths both record the full length.
- Tests: *end silence extends the render with true silence*.

## 1.10.0 - 2026-11-08

- **Bold works again.** The Bold checkbox in the Text pane had no handler and no
  state sync - it was decoration: clearing it changed nothing, and the box could
  disagree with the frame. It is now wired to `lyrics.bold`, and the box is
  restored from the config whenever the pane is rebuilt.
- **Drop shadow controls.** Two sliders in the Text pane: *Drop shadow*
  (0-100 %, strength of the black soft shadow) and *Shadow offset* (0-200 %, how
  far it sits below the letters; 100 % is the historical look, 0 is a centred
  halo). Above 100 % the blur tightens as the shadow travels, so the offset stays
  visible instead of dissolving into the blur.
- Measured on a 1508x848 preview with 120 px lyrics: bold on/off changes 40 155
  pixels (max channel delta 236/255); shadow 100 %/0 % changes 63 478 pixels;
  offset 100 %/200 % changes 30 978 pixels. Two frames drawn back to back with no
  change are pixel-identical (delta 0), so the differences are the controls.
- Tests: *the bold checkbox drives the lyric weight*, *the drop shadow sliders
  reach the config*.

## 1.10.1 - 2026-11-08

- **Fixed: changing the centre image left the old picture on screen.** Choosing a
  picture, picking one from the library, "Generated art" and "Default logo" all
  swapped the cover asset without invalidating the preview. The render loop only
  redraws when the config version changes, so the canvas kept the previous art
  until some unrelated control moved a slider. `refreshCover()` now bumps the
  version and the frame repaints on the next animation frame.
- Background image, background video and the watermark were already invalidating
  correctly; the centre-art paths were the only ones missing it.
- Tests: *a centre image change repaints the frame*.

## 1.10.2 - 2026-11-14

- **Fixed: a background clip played on its own while the song was paused.**
  Loading a video background called `play()` straight away, and
  `keepBackgroundVideoAlive()` kept it looping whenever the background type was a
  clip — so the preview ran on its own clock while the transport sat still. The
  frame on screen had no relation to the song position and the clip landed
  wherever the loop happened to be, which made judging a look misleading.
- The clip is now loaded **paused and parked on the playhead**. It plays only
  while the transport plays (and not while exporting, and not while the frame is
  frozen), it follows the transport's clock, and it re-seeks itself when it
  drifts more than 150 ms from the song position. Pausing lands it exactly on the
  playhead; a seek moves it with the song.
- Export is unchanged: the clip is still paused and seeked per frame, which is
  why rendered MP4s were never affected by this.
- `src/main.ts`: `startBackgroundVideo()` no longer starts playback;
  `keepBackgroundVideoAlive()` gained the transport check and the drift resync.
  The "background video ready" toast now says it plays with the song.
- Verified: `npm run typecheck` clean, `--selftest` 7/7.

## 1.10.3 - 2026-11-14

- **Fixed: a background clip could flicker in a rendered MP4.** 1.10.2 made the
  clip follow the transport, but the drift resync ran unconditionally — including
  during a render, where the exporter seeks that element frame by frame. The two
  fought over `currentTime`, so some frames were drawn from the playhead instead
  of the requested time: a clip that measured luma ~113 for most frames with
  isolated frames at ~125, visible as flicker.
- `keepBackgroundVideoAlive()` now returns early while `state.exporting` is true,
  pausing the clip and leaving `currentTime` to the exporter. The preview
  behaviour added in 1.10.2 is unchanged.
- Any MP4 rendered with 1.10.2 and a clip background needs re-rendering.
- Verified: `npm run typecheck` clean, `--selftest` 7/7.

## 1.11.0 - 2026-11-18

- **Fade out.** Style → Render range gains a **Fade out** slider, 0-10 s in
  half-second steps, off by default. It fades the picture to black and the sound
  to silence over the last N seconds of the file, counted back from the last
  frame — so an end-silence tail is faded too, and the two effects stack
  predictably.
- The preview draws the same fade while the playhead is inside the fader, so the
  ending can be judged before a render instead of after it.
- Export applies it on both paths. The WebCodecs loop paints a black overlay
  using `fadeAlphaAt()`; `encodeAudio()` scales the samples of the final N seconds
  with the same linear ramp; the MediaRecorder fallback schedules a gain
  automation on its destination node and overlays the same alpha.
- Saved looks carry `fadeOut`, and a look saved before 1.11.0 reads as off rather
  than breaking.
- Verified: `npm run typecheck` clean. No automated test yet — the fade is
  visual/audio and the ui-test suite has no transport fixture to assert against,
  so it was checked by eye in the preview and by measuring a rendered file.

## 1.11.1 - 2026-11-18

- **Fixed: the fade painted a dark rectangle instead of fading the frame.** The
  overlay was filled while the context was still in renderFrame()'s centred,
  scaled space (`setTransform(k, 0, 0, k, width/2, height/2)`), so
  `fillRect(0, 0, width, height)` began at the middle of the picture and ran off
  the bottom-right corner — a hard-edged block, most obvious on a bright frame.
- `paintFadeOverlay()` now lives in visualizer.ts, resets the transform to
  identity before filling, and is used by the export loop, the real-time fallback
  and the preview, so all three paint the same veil.
- Any MP4 rendered with 1.11.0 and a fade needs re-rendering.
- Verified: `npm run typecheck` clean, `--selftest` 7/7.

## 1.12.0 - 2026-11-22

- **Render range by length.** The range row gains an *End at* / *Length* switch. In
  *Length* the second field is seconds counted from From, so 0:41 + 0:30 is two
  entries instead of mental arithmetic; *End at* keeps the absolute behaviour.
- **Times are typed like the timeline.** Both fields accept `m:ss`, `h:mm:ss` or
  plain seconds and display `m:ss`, rather than raw seconds only.
- **Audio fade is its own dial.** *Picture fade* and *Audio fade* now sit separately
  under Render range: the picture ramps to black, the audio ramps to silence, each
  0-10 s. The preview applies the audio taper live, so what you hear is what the
  file gets.
- `rangeStartAt()` / `rangeEndAt()` are the single range rule, shared by the size
  estimate, the preview and both export paths; `fadeGainAt()` is the single ramp
  used by the picture overlay, the sample taper and the preview.
- Dimming gained its first test: the backdrop measures 8 -> 1 mean luma at 0 % and
  100 %, so the control is wired. It shades the background only, below the
  visualizer and the type.
- Verified: `npm run typecheck` clean, `npm run ui-test` PASS with five new checks
  (dimming, m:ss parsing, Length mode, End mode, independent fades).

## 1.12.1 - 2026-11-22

- **Fixed: the preview went black when the render range started late.** 1.12.0
  compared the raw playhead against the render length when painting the picture
  fade, so with From 0:49 and Length 0:30 a playhead at 0:54 read as "past the
  end" and the whole frame was blacked out. The same mistake ran the audio taper
  to zero there, muting the preview as well.
- Both preview hooks now measure elapsed time from the range start and only act
  while the playhead is inside the range: mid-range stays clear, the final N
  seconds fade, and a playhead past the range reads normally again. Exports were
  never affected — the exporter already worked in range-relative time.
- Tests: *the fade leaves the middle of the range alone*, *the fade reaches black
  at the range end*, *a playhead past the range is not blacked out* (2761 lit
  pixels → 0 → 2761).

## 1.13.0 - 2026-11-22

- **Caption width.** TEXT → Lyrics gains a slider, 30-90 % in 5 % steps, default
  50 %. It replaces the hard-coded `width * 0.5` in lyrics.ts, so a long line can
  use more of the frame before it wraps instead of being squeezed into a subtitle
  column. Saved looks without the value read as 50 %, so nothing old changes.
- The word and row budgets still apply on top: a wider caption fits more words per
  row, which usually means fewer rows for the same cue and therefore larger type
  inside the same row budget.
- Verified: `npm run typecheck` clean, `npm run ui-test` PASS. The new check
  measures the drawn lyric block at **457 px for 50 %** against **917 px for 90 %**.

## 1.14.0 - 2026-11-23

- **Caption hold.** Lyrics gains a hold control, 0-12 s in half-second steps, off by
  default. It caps how long a cue may stay on screen, counted from when it appears,
  and the last 0.45 s fade — so the final line no longer hangs through an
  instrumental break or the outro. 0 keeps the old rule: until the next cue.
- The fade multiplies into the same `textAlpha` the whole lyric layer uses, so pill,
  shadow, glow and karaoke sweep fade together instead of the words disappearing
  from an opaque block.
- Off by default deliberately: switching it on shortens any line whose window is
  longer than the cap, and every look saved before this release assumes the old rule.
  Set 3 s on a project that has long gaps.
- Verified: `npm run typecheck` clean, `npm run ui-test` PASS with three new checks
  (a fresh cue shows, a capped cue clears, hold 0 changes nothing).

## 1.14.1 - 2026-11-23

- **Fixed: the caption fade ran on every cue, not only held ones.** 1.14.0 sized the
  fade window from the cue's own length, so an ordinary one-second line faded across
  its last quarter and short cues visibly thinned out before the next line arrived.
  The fade now applies *only* when the hold is what ends the cue; a cue handing over
  to the next line stays at full strength right to the handover.
- **Caption hold now defaults to 3 s.** Two older lyric tests draw at t = 4 and were
  clipped by that default, so the opacity test pins `hold: 0` — it is about opacity,
  not about the hold.
- Verified: `npm run typecheck` clean, `npm run ui-test` PASS.

## 1.14.2 - 2026-11-23

- **Fixed: the hold was measured from the wrong end of the cue, so captions
  vanished mid-line.** 1.14.1 capped a cue three seconds after it *started*. The SRT
  files in this project run 5-7 seconds per cue — one sung phrase each — so every
  line disappeared after 3 s and the rest of the phrase played over an empty frame,
  which reads as captions not showing at all.
- The hold now counts from where the line **ends**: the cue's own end when the file
  gives one (SRT and LRC both do), otherwise the moment the next cue starts. Only
  the extra seconds after the line fade, 0.45 s of it, and nothing fades while the
  line is still being sung.
- `hold: 0` keeps the original rule: visible until the next cue.
- Verified: `npm run typecheck` clean, `npm run ui-test` PASS. The checks now use a
  real SRT-shaped cue (0-2 s) and confirm the line survives to 4 s, is gone by 6 s,
  and that 0 still holds it until the next cue.
