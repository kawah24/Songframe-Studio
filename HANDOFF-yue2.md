# Handoff — Songframe / Speech Studio state, for the YuE2 task

Written 2026-11-03. **Read section 0 first: this project has moved since this
document was drafted.**

## 0. Status right now (the important part)

- The repo is at **1.8.6**, not the 1.8.4 this handoff originally described.
  Versions **1.8.5** (lyric text opacity slider) and **1.8.6** (100/90/85/80 %
  stops under it) were added at ~16:35–16:49 today, with their own tests — **not by
  this task**. Another task/agent is already working in this repository.
- A Songframe instance is running with the project `Cold Floor, Warm Cup` open.
- So the YuE2 task does **not** need to "catch up" on files. This document is for
  context: why each change exists, how to rebuild, what is still open.

## 1. Which app is which

| App | Version | Location | Touched here? |
|---|---|---|---|
| **Speech Studio** (timoncool) — TTS + transcription | 0.3.5 portable | `D:\SpeechStudio` | yes: upgraded 0.2.4 → 0.3.5, models kept |
| **Songframe Studio** — song-to-video visualizer | 1.8.6 | `C:\Users\User\.openclaw-autoclaw\workspace\songframe` | yes, 1.7.7 → 1.8.4 (others continued to 1.8.6) |
| **YuE2 Studio** — music generation | 3.8.3 | `C:\Users\User\AppData\Local\YuE2 Studio` | **no: not modified at all** |

Songframe's desktop shell is a Python/pywebview one-file exe (`desktop/songframe.py` →
`desktop/dist/Songframe.exe`); the UI is TypeScript bundled into one HTML file
(`desktop/ui/songframe.html`) and embedded in the exe.

## 2. Changes made in this task (1.7.7 → 1.8.4)

| Version | Change |
|---|---|
| 1.7.7 | `zoomSpeed` config + **Zoom speed** slider (0–4×, 0 freezes the drift) |
| 1.7.8 | Pixabay photos at the best rendition the key allows (`imageURL` → `fullHDURL` → `largeImageURL`), honest caption dimensions, `imageSmoothingQuality: 'high'` |
| 1.7.9 | Full source-page URL under "Picture ready.", opens in the system browser via new `Api.open_url` |
| 1.8.0 | **Watermark**: image, size, opacity, corner; drawn above type and credit |
| 1.8.1 | Video quality reads `100% · Balanced`; estimated file size in MB from the encoder's own bitrate formula over the render range |
| 1.8.2 | Captions wrap at 50 % of frame width; `[Music]`/`(Applause)` cues dropped; inline asides stripped |
| 1.8.3 | "Visible lines" became a row budget instead of a cue count |
| 1.8.4 | **Words per line** slider (3–16, default 8): long cues are split, never shrunk to 40 % and never clipped with an ellipsis |
| *1.8.5–1.8.6* | *Not from this task — lyric text opacity and its 100/90/85/80 % stops.* |

## 3. How to rebuild and install Songframe

```powershell
cd C:\Users\User\.openclaw-autoclaw\workspace\songframe
npm run typecheck
node build.mjs                       # bundles src → dist/songframe.html
node tools/pack-desktop.mjs          # copies it to desktop/ui/
npm run ui-test                      # headless Chrome, needs Chrome installed

cd desktop
..\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --windowed `
  --onefile --name Songframe --icon songframe.ico --add-data "ui;ui" songframe.py
# then swap dist\Songframe.exe, keeping the old one as dist\Songframe.prev.exe
```

`dist\Songframe.prev.exe` is the previous build, one version behind by design.

## 4. State of Speech Studio (stable)

- Portable **0.3.5** at `D:\SpeechStudio`, `ready: true`, 15.61 GB of models, 15 voices
  (12 English, 1 German, 2 untagged); the AVX-512 crash is fixed upstream.
- `D:\SpeechStudio\tools\render-narration.ps1` — batch renderer (resumable, loudness
  normalised, master assembly, manifest).
- Desktop: `Speech Studio.bat` (launcher, must set the working directory) and
  `Render Narration (batch).bat`.
- **Outstanding:** duplicate installer build in `C:\Users\User\AppData\Local\Speech Studio`
  (same version, empty models folder) still installed; telemetry still on.

## 5. Open decisions

1. **Caption width** is a hard 50 % (`maxWidth = width * 0.5` in `src/lyrics.ts`).
   A 30–90 % slider was offered and not built.
2. **Words per line = 8** is a default, not a rule; the slider is exposed.
3. **Pixabay originals** only arrive if the API key is approved for full API access;
   otherwise the app falls back to 1280 px and the source link is the manual route.
4. **File-size estimate** is ±30 % (VBR), not a measurement.
5. Whether Songframe work belongs in the YuE2 task at all — YuE2 generates music,
   Songframe renders song-to-video.
