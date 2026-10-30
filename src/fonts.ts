/**
 * System font discovery.
 *
 * A web page cannot ask for the installed fonts: browsers hide that on purpose
 * (fingerprinting). Two sources are used instead:
 *
 *  1. The desktop shell can enumerate fonts through GDI — in the packaged app the
 *     full list arrives over the bridge and replaces the guesswork.
 *  2. Otherwise a list of known families is probed by measuring text: a family
 *     that is not installed measures exactly like the generic fallback.
 */

const PROBE = 'mmmmmmmmmmlli1WQ@#';
const BASELINES = ['monospace', 'serif', 'sans-serif'] as const;

/** Families that ship with Windows and read well as titles. */
const CANDIDATES: string[] = [
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Bahnschrift',
  'Calibri',
  'Calibri Light',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Ebrima',
  'Franklin Gothic Medium',
  'Gabriola',
  'Georgia',
  'Impact',
  'Ink Free',
  'Leelawadee UI',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Malgun Gothic',
  'Microsoft Sans Serif',
  'Microsoft YaHei',
  'MS Gothic',
  'Nirmala UI',
  'Palatino Linotype',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Segoe UI Semibold',
  'SimSun',
  'Sitka Text',
  'Sylfaen',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Yu Gothic',
  'Bebas Neue',
  'Century Gothic',
  'Futura',
  'Garamond',
  'Gill Sans MT',
  'Helvetica',
  'Inter',
  'Lato',
  'Montserrat',
  'Open Sans',
  'Oswald',
  'Poppins',
  'Roboto',
  'Roboto Condensed',
  'Source Sans Pro',
];

/** Families that render as symbols or icon glyphs rather than text. */
const BLOCKLIST = /(symbol|webdings|wingdings|dingbat|marlett|mdl2|emoji|hololens|himalaya|mongolian|myanmar|phagspa|javanese|pi std|mt extra)/i;

let suggested: string[] | null = null;
let systemFonts: string[] = [];
let merged: string[] | null = null;

function measure(font: string): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(PROBE).width;
}

export function isFontAvailable(family: string): boolean {
  const quoted = `"${family}"`;
  return BASELINES.some((baseline) => Math.abs(measure(`72px ${quoted}, ${baseline}`) - measure(`72px ${baseline}`)) > 0.4);
}

function probed(): string[] {
  if (suggested) return suggested;
  const found = CANDIDATES.filter((family) => !BLOCKLIST.test(family) && isFontAvailable(family));
  // "Segoe UI" is always present on Windows and is the studio's own face.
  if (!found.includes('Segoe UI')) found.unshift('Segoe UI');
  suggested = found.sort((a, b) => a.localeCompare(b));
  return suggested;
}

function clean(fonts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of fonts) {
    const family = name.replace(/^@/, '').trim();
    if (!family || BLOCKLIST.test(family)) continue;
    const key = family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(family);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Asks the desktop shell for the full font list; only succeeds there. */
export async function hydrateSystemFonts(): Promise<boolean> {
  type Bridge = { api?: { list_fonts?: () => Promise<{ ok: boolean; fonts?: string[] }> } };
  const bridgeOf = (): Bridge | undefined => (window as unknown as { pywebview?: Bridge }).pywebview;

  // The shell injects its bridge after the page loads; wait for it once.
  if (!bridgeOf()?.api?.list_fonts) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.removeEventListener('pywebviewready', finish);
        resolve();
      };
      window.addEventListener('pywebviewready', finish, { once: true });
      window.setTimeout(finish, 1200);
    });
  }

  const list = bridgeOf()?.api?.list_fonts;
  if (!list) return false;
  try {
    const result = await list();
    const fonts = clean(result?.fonts ?? []);
    if (fonts.length === 0) return false;
    systemFonts = fonts;
    merged = null;
    return true;
  } catch {
    return false;
  }
}

/** Every family we can offer, alphabetically. */
export function listFonts(): string[] {
  if (!merged) merged = clean([...probed(), ...systemFonts]);
  return merged;
}

/** Families worth putting at the top of the menu. */
export function suggestedFonts(): string[] {
  const all = listFonts();
  const keys = new Set(all.map((font) => font.toLowerCase()));
  return probed().filter((font) => keys.has(font.toLowerCase()));
}

/** A canvas-safe font stack for a family name. */
export function fontFamily(family: string): string {
  const cleanName = family.trim() || 'Segoe UI';
  const quoted = /^[a-zA-Z-]+$/.test(cleanName) ? cleanName : `"${cleanName}"`;
  return `${quoted}, "Segoe UI", system-ui, sans-serif`;
}
