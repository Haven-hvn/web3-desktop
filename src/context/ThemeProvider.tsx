import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME_ID, THEMES, type ThemeDefinition } from "../config/themes";

interface ThemeContextValue {
  theme: ThemeDefinition;
  themeId: string;
  setThemeId: (id: string) => void;
  cycleTheme: () => void;
  themeList: ThemeDefinition[];
}

const STORAGE_KEY = "haven-os:theme:v1";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeDefinition) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVar = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    root.style.setProperty(`--theme-${cssVar}`, value);
  }
  root.style.colorScheme = theme.isDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved in THEMES) return saved;
    } catch {
      // ignore
    }
    return DEFAULT_THEME_ID;
  });

  const setThemeId = useCallback((id: string) => {
    if (!(id in THEMES)) return;
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const theme = useMemo(() => THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID], [themeId]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    const ids = Object.keys(THEMES);
    const next = ids[(ids.indexOf(themeId) + 1) % ids.length];
    setThemeId(next);
  }, [themeId, setThemeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeId,
      setThemeId,
      cycleTheme,
      themeList: Object.values(THEMES),
    }),
    [theme, themeId, setThemeId, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
