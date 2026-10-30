/**
 * Chrome themes. These change the studio's own accent colours; the video palette
 * (Style → Palette) is separate and still travels with the look file.
 */

export interface Theme {
  id: string;
  name: string;
  accent: string;
  accent2: string;
}

export const THEMES: Theme[] = [
  { id: 'songframe', name: 'Songframe', accent: '#ec4899', accent2: '#8b5cf6' },
  { id: 'brandl', name: 'Brandl', accent: '#2fd3cb', accent2: '#ec9a3c' },
  { id: 'sunset', name: 'Sunset', accent: '#f97316', accent2: '#e11d48' },
  { id: 'ocean', name: 'Ocean', accent: '#06b6d4', accent2: '#3b82f6' },
  { id: 'mono', name: 'Mono', accent: '#e5e7eb', accent2: '#71717a' },
];

const STORAGE_KEY = 'songframe.theme';

function rgbTriplet(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full.slice(0, 6) || '000000', 16);
  if (Number.isNaN(value)) return '236, 72, 153';
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

export function currentThemeId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'songframe';
  } catch {
    return 'songframe';
  }
}

export function applyTheme(id: string): Theme {
  const theme = THEMES.find((entry) => entry.id === id) ?? THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-2', theme.accent2);
  root.style.setProperty('--accent-rgb', rgbTriplet(theme.accent));
  root.style.setProperty('--accent-2-rgb', rgbTriplet(theme.accent2));
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    /* private mode: the theme lasts for this session */
  }
  return theme;
}
