import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'thp-theme';

/** The stored theme. Dark unless the visitor chose light. ("asphalt" was the old name of dark.) */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage can be blocked; the theme still works for this visit */
  }
}

/** Dark by default, light on request, remembered across visits when storage is available. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Charts drawn on a canvas pick their colours when they draw; a resize makes them redraw.
    window.dispatchEvent(new Event('resize'));
  }, [theme]);
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    setTheme(next);
  }, [theme]);
  return { theme, toggle };
}

/** The theme the page shows now, following every change made by the header button. */
export function usePageTheme(): Theme {
  const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    setTheme(read());
    return () => obs.disconnect();
  }, []);
  return theme;
}
