"""Songframe Studio - Windows desktop app.

A thin, native shell around the studio UI: the window is WebView2 (Chromium), the
rendering happens in the page with WebCodecs, and Python owns the things a browser
cannot do properly - a real window, a real Save dialog, files written where the
user says, and one executable with no browser chrome.

    python songframe.py                 # run
    python songframe.py --selftest      # headless check of the UI bridge
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

APP_NAME = "Songframe Studio"
APP_VERSION = "1.3.0"
WINDOW_TITLE = f"{APP_NAME} {APP_VERSION}"

VIDEO_TYPES = ("Video file (*.mp4;*.webm)", "All files (*.*)")
IMAGE_TYPES = ("PNG image (*.png)", "All files (*.*)")
JSON_TYPES = ("Songframe look (*.json)", "All files (*.*)")

try:
    import webview  # type: ignore
except ImportError:  # pragma: no cover - only when dependencies are missing
    sys.stderr.write(
        "pywebview is not installed.\n"
        "Install the desktop dependencies first:\n\n"
        "    python -m pip install -r requirements.txt\n\n"
    )
    raise SystemExit(2)


def app_root() -> Path:
    """Where the read-only payload lives, frozen or not."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def ui_file() -> Path:
    return app_root() / "ui" / "songframe.html"


def documents_dir() -> Path:
    for name in ("Videos", "Downloads", "Documents"):
        candidate = Path.home() / name
        if candidate.is_dir():
            return candidate
    return Path.home()


def window_box() -> tuple[int, int, int, int]:
    """A window that fits this screen, centred, capped at 1440x900."""
    fallback = (1440, 900, 0, 0)
    if sys.platform != "win32":
        return fallback
    try:
        import ctypes
        from ctypes import wintypes

        area = wintypes.RECT()
        if not ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(area), 0):
            return fallback
        avail_w = area.right - area.left
        avail_h = area.bottom - area.top
        width = max(980, min(1440, avail_w - 48))
        height = max(640, min(900, avail_h - 48))
        x = area.left + max(0, (avail_w - width) // 2)
        y = area.top + max(0, (avail_h - height) // 2)
        return (width, height, x, y)
    except Exception:  # noqa: BLE001 - layout is not worth failing over
        return fallback


def human_size(value: int) -> str:
    if value >= 1024 * 1024:
        return f"{value / 1024 / 1024:.1f} MB"
    return f"{value / 1024:.0f} KB"


class Api:
    """Everything the page may call, exposed as ``pywebview.api``.

    Large artefacts (a rendered MP4 can be a hundred megabytes) are streamed in
    chunks: base64 across the JS bridge is fine for a few megabytes at a time, and
    a single string of that size would be a bad idea.
    """

    def __init__(self) -> None:
        self._uploads: dict[str, dict[str, Any]] = {}
        self.last_saved: Path | None = None
        self._fonts: list[str] | None = None

    # -- diagnostics ----------------------------------------------------
    def app_info(self) -> dict[str, Any]:
        return {
            "name": APP_NAME,
            "version": APP_VERSION,
            "python": sys.version.split()[0],
            "frozen": bool(getattr(sys, "frozen", False)),
            "platform": sys.platform,
            "ui": str(ui_file()),
        }

    # -- saving ---------------------------------------------------------
    def save_begin(self, filename: str, kind: str = "video", path: str | None = None) -> dict[str, Any]:
        """Ask where the file goes and open a temp file next to it.

        ``path`` is only used by the selftest; the UI never passes it.
        """
        safe_name = Path(filename).name or "songframe.mp4"
        if path:
            target = Path(path)
            target.parent.mkdir(parents=True, exist_ok=True)
        else:
            file_types = VIDEO_TYPES if kind == "video" else IMAGE_TYPES if kind == "image" else JSON_TYPES
            chosen = self._window.create_file_dialog(
                webview.FileDialog.SAVE,
                directory=str(documents_dir()),
                save_filename=safe_name,
                file_types=file_types,
            )
            if not chosen:
                return {"ok": False, "cancelled": True}
            value = chosen if isinstance(chosen, str) else chosen[0]
            target = Path(value)
            if target.suffix == "" and Path(safe_name).suffix:
                target = target.with_suffix(Path(safe_name).suffix)

        token = secrets.token_hex(8)
        # Stage the file next to its destination: os.replace cannot cross volumes,
        # and a render often lands on another drive than %TEMP%.
        try:
            handle = tempfile.NamedTemporaryFile(
                prefix=f".{target.stem}-", suffix=".part", dir=str(target.parent), delete=False
            )
        except OSError:
            handle = tempfile.NamedTemporaryFile(prefix="songframe-", suffix=".part", delete=False)
        self._uploads[token] = {"handle": handle, "target": target, "written": 0, "kind": kind}
        return {"ok": True, "token": token, "name": target.name, "directory": str(target.parent)}

    def save_chunk(self, token: str, data: str) -> dict[str, Any]:
        upload = self._uploads.get(token)
        if upload is None:
            return {"ok": False, "error": "unknown upload"}
        try:
            raw = base64.b64decode(data)
            upload["handle"].write(raw)
            upload["written"] += len(raw)
        except Exception as error:  # noqa: BLE001 - reported to the page
            return {"ok": False, "error": str(error)}
        return {"ok": True, "written": upload["written"]}

    def save_end(self, token: str) -> dict[str, Any]:
        upload = self._uploads.pop(token, None)
        if upload is None:
            return {"ok": False, "error": "unknown upload"}
        handle = upload["handle"]
        target: Path = upload["target"]
        try:
            handle.flush()
            handle.close()
            try:
                os.replace(handle.name, target)
            except OSError:
                # Different volume, or a filesystem that will not rename: copy instead.
                shutil.move(handle.name, target)
        except Exception as error:  # noqa: BLE001
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            return {"ok": False, "error": str(error)}
        self.last_saved = target
        return {"ok": True, "path": str(target), "bytes": upload["written"], "size": human_size(upload["written"])}

    def save_cancel(self, token: str) -> dict[str, Any]:
        upload = self._uploads.pop(token, None)
        if upload is None:
            return {"ok": True}
        try:
            upload["handle"].close()
            os.unlink(upload["handle"].name)
        except OSError:
            pass
        return {"ok": True}

    # -- shell integration ----------------------------------------------
    def reveal(self, path: str) -> dict[str, Any]:
        """Show the finished file in Explorer, selected."""
        target = Path(path)
        if not target.exists():
            return {"ok": False, "error": "that file is gone"}
        try:
            if sys.platform == "win32":
                os.system(f'explorer /select,"{target}"')
            else:
                import subprocess

                subprocess.Popen(["xdg-open", str(target.parent)])
        except Exception as error:  # noqa: BLE001
            return {"ok": False, "error": str(error)}
        return {"ok": True}

    def open_folder(self, path: str) -> dict[str, Any]:
        target = Path(path)
        folder = target if target.is_dir() else target.parent
        try:
            if sys.platform == "win32":
                os.startfile(str(folder))  # type: ignore[attr-defined]
            else:
                import subprocess

                subprocess.Popen(["xdg-open", str(folder)])
        except Exception as error:  # noqa: BLE001
            return {"ok": False, "error": str(error)}
        return {"ok": True}

    def list_fonts(self) -> dict[str, Any]:
        """Every installed font family, for the text tool's font menu.

        Browsers hide the font list from pages, so the shell enumerates it
        through GDI and hands it over the bridge.
        """
        if self._fonts is not None:
            return {"ok": True, "fonts": self._fonts}
        if sys.platform != "win32":
            return {"ok": True, "fonts": []}
        try:
            import ctypes
            from ctypes import wintypes

            class LogFont(ctypes.Structure):
                _fields_ = [
                    ("lfHeight", wintypes.LONG),
                    ("lfWidth", wintypes.LONG),
                    ("lfEscapement", wintypes.LONG),
                    ("lfOrientation", wintypes.LONG),
                    ("lfWeight", wintypes.LONG),
                    ("lfItalic", wintypes.BYTE),
                    ("lfUnderline", wintypes.BYTE),
                    ("lfStrikeOut", wintypes.BYTE),
                    ("lfCharSet", wintypes.BYTE),
                    ("lfOutPrecision", wintypes.BYTE),
                    ("lfClipPrecision", wintypes.BYTE),
                    ("lfQuality", wintypes.BYTE),
                    ("lfPitchAndFamily", wintypes.BYTE),
                    ("lfFaceName", wintypes.WCHAR * 32),
                ]

            collected: set[str] = set()

            def collect(logfont, _metric, _kind, _param):
                face = logfont.contents.lfFaceName
                if face and not face.startswith("@"):
                    collected.add(face)
                return 1

            proc = ctypes.WINFUNCTYPE(
                ctypes.c_int, ctypes.POINTER(LogFont), ctypes.c_void_p, wintypes.DWORD, wintypes.LPARAM
            )(collect)
            gdi = ctypes.windll.gdi32
            gdi.EnumFontFamiliesExW.argtypes = [
                wintypes.HDC,
                ctypes.POINTER(LogFont),
                ctypes.c_void_p,
                wintypes.LPARAM,
                wintypes.DWORD,
            ]
            hdc = ctypes.windll.user32.GetDC(None)
            try:
                probe = LogFont()
                probe.lfCharSet = 1  # DEFAULT_CHARSET
                gdi.EnumFontFamiliesExW(hdc, ctypes.byref(probe), ctypes.cast(proc, ctypes.c_void_p), 0, 0)
            finally:
                ctypes.windll.user32.ReleaseDC(None, hdc)

            self._fonts = sorted(collected, key=str.lower)
            return {"ok": True, "fonts": self._fonts}
        except Exception as error:  # noqa: BLE001 - reported to the page
            return {"ok": False, "error": str(error), "fonts": []}

    def set_title(self, title: str) -> dict[str, Any]:
        if self._window is not None:
            clean = title.strip()
            self._window.set_title(f"{clean} — {APP_NAME}" if clean else WINDOW_TITLE)
        return {"ok": True}


def run(selftest: bool = False, debug: bool = False) -> int:
    page = ui_file()
    if not page.exists():
        sys.stderr.write(f"The UI is missing: {page}\nRun `npm run desktop` to build and copy it.\n")
        return 2

    api = Api()
    # The library links out to Pixabay's API page; that belongs in the browser,
    # not in the app window.
    try:
        webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    except Exception:  # noqa: BLE001 - older pywebview builds
        pass
    width, height, x, y = window_box()
    window = webview.create_window(
        WINDOW_TITLE,
        url=page.as_uri(),
        js_api=api,
        width=width,
        height=height,
        x=x,
        y=y,
        min_size=(980, 620),
        background_color="#08080a",
        hidden=selftest,
        text_select=True,
    )
    api._window = window  # noqa: SLF001 - the API needs the window for dialogs

    if not selftest:
        webview.start(debug=debug, private_mode=False)
        return 0

    outcome: dict[str, Any] = {"passed": False, "steps": []}

    def await_js(window: "webview.Window", script: str, timeout: float = 60.0) -> Any:
        """evaluate_js returns immediately for a Promise; wait for its callback."""
        box: dict[str, Any] = {}
        done = threading.Event()

        def receive(value: Any) -> None:
            box["value"] = value
            done.set()

        window.evaluate_js(script, receive)
        if not done.wait(timeout):
            raise TimeoutError("JavaScript did not resolve in time")
        return box.get("value")

    def check(window: "webview.Window") -> None:
        try:
            if not window.events.loaded.wait(45):
                outcome["error"] = "the page did not finish loading"
                return
            deadline = time.time() + 20
            ready = False
            while time.time() < deadline:
                ready = bool(window.evaluate_js("Boolean(window.songframe && window.songframe.ready)"))
                if ready:
                    break
                time.sleep(0.25)
            outcome["steps"].append(("ui-ready", ready))

            info = await_js(window, "window.pywebview.api.app_info()", 30)
            outcome["steps"].append(("bridge", bool(info and info.get("name") == APP_NAME)))
            outcome["app_info"] = info

            # stream a small blob through the same path an export takes
            with tempfile.TemporaryDirectory() as folder:
                target = Path(folder) / "bridge-test.mp4"
                probe = await_js(
                    window,
                    """
                    (async () => {
                      const payload = new Uint8Array(64 * 1024).map((_, i) => i % 251);
                      const blob = new Blob([payload], { type: 'video/mp4' });
                      const begin = await window.pywebview.api.save_begin('bridge-test.mp4', 'video', __TARGET__);
                      if (!begin || !begin.ok) return { ok: false, begin };
                      let sent = 0;
                      for (let offset = 0; offset < blob.size; offset += 32 * 1024) {
                        const slice = blob.slice(offset, offset + 32 * 1024);
                        const base64 = await new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(String(reader.result).split(',')[1]);
                          reader.readAsDataURL(slice);
                        });
                        const part = await window.pywebview.api.save_chunk(begin.token, base64);
                        if (!part || !part.ok) return { ok: false, part };
                        sent = part.written;
                      }
                      const end = await window.pywebview.api.save_end(begin.token);
                      return { ok: !!end.ok, sent, path: end.path };
                    })()
                    """.replace("__TARGET__", json.dumps(str(target))),
                    60,
                )
                saved = target.exists() and target.stat().st_size == 64 * 1024
                outcome["steps"].append(("bridge-save", bool(probe and probe.get("ok") and saved)))
                outcome["save"] = probe

            # The desktop build has to be able to render, not just draw the UI:
            # this is the same WebCodecs path an export takes, inside WebView2.
            render = await_js(
                window,
                """
                (async () => {
                  const rate = 44100, frames = rate * 2;
                  const bytes = new Uint8Array(44 + frames * 2);
                  const view = new DataView(bytes.buffer);
                  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
                  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
                  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
                  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
                  text(36, 'data'); view.setUint32(40, frames * 2, true);
                  for (let i = 0; i < frames; i++) {
                    const v = Math.sin((i / rate) * 2 * Math.PI * 220) * 9000 + (Math.random() * 2 - 1) * 1500;
                    view.setInt16(44 + i * 2, Math.max(-32000, Math.min(32000, v)), true);
                  }
                  await window.songframe.loadAudioFile(new File([bytes], 'Selftest.wav', { type: 'audio/wav' }));
                  const blob = await window.songframe.exportVideo({ maxSeconds: 1, height: 480, fps: 24 });
                  return { type: blob.type, bytes: blob.size };
                })()
                """,
                180,
            )
            outcome["steps"].append(("render", bool(render and render.get("bytes", 0) > 20000)))
            outcome["render"] = render

            # The background library talks to Wikimedia Commons from inside WebView2.
            library = await_js(
                window,
                """
                (async () => {
                  try {
                    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
                      + '&generator=search&gsrsearch=' + encodeURIComponent('filetype:bitmap rain window')
                      + '&gsrlimit=3&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=320';
                    const response = await fetch(url, { mode: 'cors' });
                    const data = await response.json();
                    return { ok: response.ok, count: Object.keys(data.query?.pages ?? {}).length };
                  } catch (error) {
                    return { ok: false, error: String(error) };
                  }
                })()
                """,
                45,
            )
            outcome["steps"].append(("library", bool(library and library.get("ok") and library.get("count", 0) > 0)))
            outcome["library"] = library

            # The font menu should be the machine's list, not a short guess.
            fonts = await_js(window, "window.pywebview.api.list_fonts()", 30)
            font_list = fonts.get("fonts", []) if isinstance(fonts, dict) else []
            outcome["steps"].append(("fonts", bool(fonts and fonts.get("ok") and len(font_list) > 50)))
            outcome["font_count"] = len(font_list)

            time.sleep(0.6)
            options = window.evaluate_js(
                "(() => { const s = document.querySelector('#textList select'); return s ? s.options.length : 0; })()"
            )
            outcome["steps"].append(("font-menu", isinstance(options, int) and options > 100))
            outcome["font_options"] = options
        except Exception as error:  # noqa: BLE001 - surfaced in the result
            outcome["error"] = str(error)
        finally:
            outcome["passed"] = all(ok for _, ok in outcome["steps"]) and len(outcome["steps"]) == 7
            payload = json.dumps(outcome, indent=2)
            print(payload)
            # A --windowed build has no console; the file is how a packaged
            # selftest reports what happened.
            try:
                (Path(tempfile.gettempdir()) / "songframe-selftest.json").write_text(payload, encoding="utf-8")
            except OSError:
                pass
            window.destroy()

    webview.start(check, window, debug=debug, private_mode=True)
    return 0 if outcome.get("passed") else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--selftest", action="store_true", help="check the UI and the Python bridge, then exit")
    parser.add_argument("--debug", action="store_true", help="open with the WebView inspector enabled")
    args = parser.parse_args()
    return run(selftest=args.selftest, debug=args.debug)


if __name__ == "__main__":
    raise SystemExit(main())
