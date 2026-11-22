export interface ThemeColors {
  background: string;
  surface: string;
  surfaceVariant: string;
  onBackground: string;
  onSurface: string;
  onSurfaceVariant: string;
  primary: string;
  primaryVariant: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  windowFrame: string;
  titleBarActive: string;
  titleBarActiveGradient: string;
  titleBarInactive: string;
  titleBarInactiveGradient: string;
  titleBarText: string;
  titleBarInactiveText: string;
  buttonFace: string;
  buttonHighlight: string;
  buttonShadow: string;
  buttonDarkShadow: string;
  buttonText: string;
  buttonHover: string;
  borderLight: string;
  borderDark: string;
  focusRing: string;
  selection: string;
  selectionBorder: string;
  onSelection: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
  isHighContrast: boolean;
  colors: ThemeColors;
}

export const THEMES: Record<string, ThemeDefinition> = {
  classic: {
    id: "classic",
    name: "Haven 98 Classic",
    description: "Classic Windows 98 teal desktop with crisp beveled chrome",
    isDark: false,
    isHighContrast: false,
    colors: {
      background: "#008080",
      surface: "#c0c0c0",
      surfaceVariant: "#ffffff",
      onBackground: "#ffffff",
      onSurface: "#000000",
      onSurfaceVariant: "#222222",
      primary: "#000080",
      primaryVariant: "#1084d0",
      onPrimary: "#ffffff",
      secondary: "#808080",
      onSecondary: "#ffffff",
      error: "#c41e1e",
      warning: "#996500",
      success: "#007a2f",
      info: "#0044cc",
      windowFrame: "#0a0a0a",
      titleBarActive: "#000080",
      titleBarActiveGradient: "#1084d0",
      titleBarInactive: "#808080",
      titleBarInactiveGradient: "#b5b5b5",
      titleBarText: "#ffffff",
      titleBarInactiveText: "#dcdcdc",
      buttonFace: "#c0c0c0",
      buttonHighlight: "#ffffff",
      buttonShadow: "#808080",
      buttonDarkShadow: "#000000",
      buttonText: "#000000",
      buttonHover: "#d8d8d8",
      borderLight: "#dfdfdf",
      borderDark: "#808080",
      focusRing: "#000000",
      selection: "rgba(0, 0, 128, 0.25)",
      selectionBorder: "#000080",
      onSelection: "#ffffff",
    },
  },
  observatory: {
    id: "observatory",
    name: "Observatory Dark",
    description: "Dark obsidian theme inspired by the Haven Atlas Observatory",
    isDark: true,
    isHighContrast: false,
    colors: {
      background: "#0d1117",
      surface: "#1f242c",
      surfaceVariant: "#14181f",
      onBackground: "#f0f3f8",
      onSurface: "#eef2f7",
      onSurfaceVariant: "#b6c0cc",
      primary: "#d95d39",
      primaryVariant: "#8b331d",
      onPrimary: "#ffffff",
      secondary: "#546070",
      onSecondary: "#ffffff",
      error: "#ff6b6b",
      warning: "#f5b841",
      success: "#4ad66d",
      info: "#5aa9ff",
      windowFrame: "#000000",
      titleBarActive: "#1b2838",
      titleBarActiveGradient: "#d95d39",
      titleBarInactive: "#242a33",
      titleBarInactiveGradient: "#343c47",
      titleBarText: "#ffffff",
      titleBarInactiveText: "#94a0b0",
      buttonFace: "#2b323d",
      buttonHighlight: "#475264",
      buttonShadow: "#14181f",
      buttonDarkShadow: "#05070a",
      buttonText: "#eef2f7",
      buttonHover: "#394250",
      borderLight: "#495466",
      borderDark: "#12161c",
      focusRing: "#d95d39",
      selection: "rgba(217, 93, 57, 0.28)",
      selectionBorder: "#d95d39",
      onSelection: "#ffffff",
    },
  },
  "high-contrast": {
    id: "high-contrast",
    name: "High Contrast",
    description: "High contrast accessibility palette",
    isDark: true,
    isHighContrast: true,
    colors: {
      background: "#000000",
      surface: "#000000",
      surfaceVariant: "#000000",
      onBackground: "#ffffff",
      onSurface: "#ffffff",
      onSurfaceVariant: "#ffffff",
      primary: "#ffff00",
      primaryVariant: "#ffff00",
      onPrimary: "#000000",
      secondary: "#00ffff",
      onSecondary: "#000000",
      error: "#ff4444",
      warning: "#ffff00",
      success: "#00ff00",
      info: "#00ffff",
      windowFrame: "#ffffff",
      titleBarActive: "#ffff00",
      titleBarActiveGradient: "#ffff00",
      titleBarInactive: "#444444",
      titleBarInactiveGradient: "#444444",
      titleBarText: "#000000",
      titleBarInactiveText: "#ffffff",
      buttonFace: "#000000",
      buttonHighlight: "#ffffff",
      buttonShadow: "#ffffff",
      buttonDarkShadow: "#ffffff",
      buttonText: "#ffffff",
      buttonHover: "#222222",
      borderLight: "#ffffff",
      borderDark: "#ffffff",
      focusRing: "#ffff00",
      selection: "#ffff00",
      selectionBorder: "#ffff00",
      onSelection: "#000000",
    },
  },
};

export const DEFAULT_THEME_ID = "classic";
