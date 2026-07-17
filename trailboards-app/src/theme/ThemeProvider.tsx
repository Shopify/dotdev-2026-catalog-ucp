import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { ThemeName } from '../types';

const THEMES: ThemeName[] = ['field', 'night', 'blueprint'];
const STORAGE_KEY = 'tb-theme';

function readStored(): ThemeName {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw && (THEMES as string[]).includes(raw) ? (raw as ThemeName) : 'field';
}

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  themes: ThemeName[];
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(readStored);

  // One hook owns the wiring: mirror theme to <html data-theme> + localStorage.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <Ctx.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
