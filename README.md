# Songframe Studio

A standalone song-to-video visualizer. Drop in a track, design the look, render a real MP4 — all in the browser, with no server, no account and no network connection.

The Video Maker from [YuE2-Studio](https://github.com/timoncool/YuE2-Studio) rebuilt as an independent tool: same ten visualizer presets and the same four-panel workflow, none of the music-generation stack.

## Run it

Two builds of the same studio, sharing one engine.

### The Windows app (recommended)

```
desktop\dist\Songframe.exe
```

Double-click. A native window — no browser chrome, no tab — with real Windows Save dialogs: rendering asks where the file goes and writes it there, and the result row can reveal it in Explorer. About 12 MB and self-contained. It uses the Microsoft Edge WebView2 runtime, which ships with Windows 10/11.

Run from source if you prefer:

```powershell
python -m pip install -r desktop/requirements.txt
python desktop/songframe.py
python desktop/songframe.py --selftest   # checks the window, the JS bridge and a real MP4 render
```

Rebuild the executable after changing the UI:

```powershell
powershell -ExecutionPolicy Bypass -File desktop/build_exe.ps1
```

### The single file

```
dist\songframe.html
```

Double-click that file. It is one self-contained HTML document (about 235 KB) with the code, styles and the MP4 muxer inlined, so it runs from `file://` with no install step and works offline.

## What it does

**Song** — drag in MP3, WAV, FLAC, OGG, M4A or AAC; anything Chrome can decode. The eject button in the header unloads the current track and returns to the dropzone while keeping your look; **Reset all** in the panel footer puts song, text, background and effects back to the defaults. Both ask before doing anything. The track is decoded to 48 kHz stereo and analysed once per frame, so playback and export always agree.

**Presets** — ten visualizers driven by the song's own spectrum. Two response controls sit under the grid: **Sensitivity** (50–200%) scales how hard the music pushes the shapes — lower it when bars sit pinned at the ceiling — and **Bar count** (16–128) sets how many bars, rows or columns the preset draws.

| Preset | Shape |
| --- | --- |
| Classic NCS | 80 radial bars orbiting the cover art |
| Spectrum | 64 mirrored vertical bars |
| Mirror | horizontal bars from both edges, four-way symmetry |
| Shockwave | concentric rippling ellipses |
| Orbital | five glowing arcs, counter-rotating |
| Hex Core | double hexagon with vertex pulses |
| Analog | oscilloscope waveform |
| Matrix | falling glyph columns |
| Pulse | rings that fire out of a glowing core |
| Clean | type and backdrop only, with a waveform hairline |
| Waveform | the whole track's waveform, played part bright, with a playhead |
| Vinyl | spinning record with the cover as its label and a progress ring |
| Lyrics | type-only layout for lyric videos, with a bass-reactive glow |
| Halo | rainbow spectrum ring in perspective, with a sunburst floor |

The centre image starts as the studio logo (embedded in the build), with *Default logo* and *Generated art* to switch, and *Choose image* / *Library* for your own.

**Style** — 16:9 / 9:16 / 1:1; 1080p / 720p / 480p; 24 / 30 / 60 fps; 128–320 kbps audio; ten palettes plus custom colours; procedural, pattern, photo or video background; dimming; visualizer scale; particles; centre artwork.

**Background library** — open it from Style → Browse library:

- **Photos** searches the active source and shows a grid of free photographs; picking one loads a 1600 px copy for the frame.
- **Videos** does the same for clips, using Commons' 480p/720p WebM transcodes (a two-minute clip is a few megabytes, not a gigabyte). Video backgrounds are seeked frame by frame on export.
- **Patterns** is twelve generated backdrops — aurora, dusk, spotlight, mesh, waves, rings, grid, bokeh, streaks, prism, horizon, clouds — drawn on your machine, so they work offline and export at full resolution.
- **Sources** — Commons works with no setup. **Pixabay** is the second source and needs a free API key from [pixabay.com/api/docs](https://pixabay.com/api/docs/) (Pixabay's rule, not ours); paste it once and it is stored on this machine. Only the search needs the key — images and clips come straight from Pixabay's CDN.
- Suggestions (“For this track”) come from the song's name and its palette.

Photos and clips keep their licence and author. The credit line is written into the corner of the video and can be switched off in Style. Pixabay media carries its contributor's name; Commons media carries the licence too.

**Text** — any number of layers with font, size, colour, weight, alignment and opacity. The font menu lists the families actually installed on the machine (about 50 on a default Windows box), not a fixed six, dragged straight on the canvas and resized with the wheel.

**Lyrics** — load `.lrc` or `.srt` (SubRip cues, including their end times), or paste plain text and distribute it across the song. Three styles: karaoke sweep, stacked lines, and scrolling. Position, size, visible line count, colours, pill opacity and a ±5 s timing offset.

**FX** — shake, glitch, VHS, CCTV, scanlines, chromatic aberration, bloom, film grain, pixelate, strobe, vignette, hue shift, letterbox. Each with its own intensity.

**Export** — H.264 + AAC in an MP4, encoded with WebCodecs and muxed by `mp4-muxer`, straight from the canvas at the chosen resolution. A **render range** (From / To in seconds, or “Start at the playhead”) cuts a section out of the song — the audio is trimmed to the same window, so a 1 s range produces a 1 s file. Progress with frame counts, cancel at any point, and a download link that stays available afterwards. `Save frame` writes a PNG; `Save look` writes a JSON preset you can load onto any other song.

## Themes

The palette icon in the header recolours the studio itself: **Songframe** (pink/violet), **Brandl** (teal/orange), **Sunset**, **Ocean** and **Mono**. The choice is remembered between sessions. This is separate from the video's palette (Style → Palette), which travels with the exported look file.

## Keyboard

| Key | Action |
| --- | --- |
| `Space` | play / pause |
| `←` `→` | seek ±5 s |
| `Home` | back to the start |
| `M` | mute |

## Develop

```bash
npm install
npm run build      # -> dist/songframe.html
npm run typecheck  # strict TypeScript, no emit
npm run smoke      # headless Chrome: presets, lyrics, real MP4, ffprobe
npm run ui-test    # clicks through the real interface
npm run shots      # screenshots of every tab into tools/out
```

`src/` is organised by job:

| File | Responsibility |
| --- | --- |
| `main.ts` | state, wiring, transport, export flow, `window.songframe` test API |
| `audio.ts` | decode, 48 kHz stereo, waveform peaks, `frameAt(song, t)` |
| `fft.ts` | radix-2 FFT, 96 perceptual bands, per-frame levelling |
| `visualizer.ts` | one `renderFrame` — background, presets, particles, text, lyrics, FX |
| `lyrics.ts` | LRC parsing, plain-text distribution, karaoke/lines/scroll drawing |
| `backgrounds.ts` | procedural scenes, cover generation, media loading |
| `export.ts` | frame sizing, WebCodecs MP4, MediaRecorder fallback |
| `ui.ts` | panel construction, controls, seek waveform, toasts |

Everything is drawn in a **1080-space** (frame short side = 1080) and scaled once per frame, so the preview and the exported file are the same picture at different resolutions. Preview frames and export frames come from the same `frameAt()` call, which is why a paused preview is pixel-identical to the corresponding exported frame.

## Browser support

Chrome, Edge, Opera and other Chromium browsers, desktop. The fast path needs WebCodecs (`VideoEncoder` H.264 + `AudioEncoder` AAC). Without it, the app falls back to `MediaRecorder` on a captured canvas, which records in real time and produces WebM or MP4 depending on what the browser supports; the file type is reported honestly in the dialog.

Safari and Firefox have partial WebCodecs support; they will usually take the fallback path.

## Performance

Measured in headless Chrome 156 on a desktop CPU (no GPU acceleration), 10-second excerpts, particles 60:

| Output | Time | Speed | File |
| --- | --- | --- | --- |
| 1080p 30 fps | 5.5 s | 1.8× realtime | 11.3 MB |
| 1080p 60 fps | 5.8 s | 1.0× realtime | 11.6 MB |
| 720p 30 fps | 4.6 s | 2.2× realtime | 5.4 MB |

A four-minute song takes roughly 2–4 minutes at 1080p. Frame rate is the biggest cost; heavy effects (film grain, pixelate, hue shift) add more.

## Limits worth knowing

- Audio has to be decodable by the browser; DRM-protected files are not.
- A background video is re-seeked for every exported frame, which is correct but slower than a still image.
- Film grain reads back the full frame each frame; expect a visible slowdown with it enabled at 1080p.
- The build targets Chrome 110+; the file uses `structuredClone`, `roundRect`, `AudioEncoder` and `VideoFrame`.
- The generated "rendered on this machine" MP4 is H.264 High profile, `yuv420p`, `+faststart`.

## Test API

`window.songframe` exists for automation and for poking at the app from the console:

```js
await songframe.loadAudioFile(file)
songframe.loadLyrics(lrcText)
songframe.setConfig({ preset: 'Orbital', aspect: '9:16' })
songframe.drawAt(12.4)                  // hold a preview frame at 12.4 s
songframe.getFrame(12.4)                // bands, wave stats, bass/mid/treble
await songframe.exportVideo({ height: 480, fps: 24, maxSeconds: 3 })
```
