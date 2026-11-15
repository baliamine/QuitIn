export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'quitin-theme';
export const THEME_CHANGE_EVENT = 'quitin-theme-change';

/** Read the theme currently applied to the document. */
export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/**
 * Apply a theme: toggles the `light` class on <html>, persists the choice in
 * localStorage (so it survives reloads) and notifies other listeners.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode) — the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
