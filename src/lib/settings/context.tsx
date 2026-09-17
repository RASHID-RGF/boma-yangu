'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type FontFamily = 'inter' | 'jetbrains-mono' | 'system';
export type ContrastLevel = 'low' | 'medium' | 'high';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  fontFamily: FontFamily;
  fontSize: 'small' | 'medium' | 'large';
  contrast: ContrastLevel;
  theme: ThemeMode;
}

interface SettingsContextType {
  settings: Settings;
  setFontFamily: (font: FontFamily) => void;
  setFontSize: (size: 'small' | 'medium' | 'large') => void;
  setContrast: (contrast: ContrastLevel) => void;
  setTheme: (theme: ThemeMode) => void;
  resetSettings: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const DEFAULTS: Settings = {
  fontFamily: 'inter',
  fontSize: 'medium',
  contrast: 'medium',
  theme: 'dark',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'boma-yangu-settings';

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {}
  return DEFAULTS;
}

const FONT_MAP: Record<FontFamily, string> = {
  'inter': "'Inter', system-ui, sans-serif",
  'jetbrains-mono': "'JetBrains Mono', 'Fira Code', monospace",
  'system': "system-ui, -apple-system, sans-serif",
};

const CONTRAST_MAP: Record<ContrastLevel, { text: string; muted: string; bg: string; brightness: string; contrast: string }> = {
  low: { text: '#a0a0a0', muted: '#585858', bg: '#0a0a14', brightness: '0.85', contrast: '0.9' },
  medium: { text: '#d4d4d4', muted: '#646669', bg: '#0f0f1a', brightness: '1', contrast: '1' },
  high: { text: '#ffffff', muted: '#8a8a8a', bg: '#050510', brightness: '1.15', contrast: '1.15' },
};

export function applySettings(settings: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Apply font
  root.style.fontFamily = FONT_MAP[settings.fontFamily];

  // Apply font size
  const sizeMap = { small: '13px', medium: '14px', large: '16px' };
  root.style.fontSize = sizeMap[settings.fontSize];

  // Apply contrast via CSS custom properties
  const contrast = CONTRAST_MAP[settings.contrast];
  root.style.setProperty('--settings-text', contrast.text);
  root.style.setProperty('--settings-muted', contrast.muted);
  root.style.setProperty('--settings-bg', contrast.bg); // Ensure theme sets inline CSS vars

  // Apply global filter for real contrast effect across the entire page
  const content = document.querySelector('[data-settings-root]') as HTMLElement | null;
  if (content) {
    content.style.filter = `brightness(${contrast.brightness}) contrast(${contrast.contrast})`;
  }
  // Apply theme mode: respect explicit theme or system preference
  const applyTheme = (mode: ThemeMode) => {
    let used: 'light' | 'dark' = 'dark';
    if (mode === 'system') {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      used = prefersLight ? 'light' : 'dark';
    } else {
      used = mode;
    }
    root.dataset.theme = used;
  };
  applyTheme(settings.theme);
  // Apply theme mode: set base colors inline so they take effect over CSS rules
  const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
    if (mode === 'system') {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      return prefersLight ? 'light' : 'dark';
    }
    return mode;
  };

  const usedTheme = resolveTheme(settings.theme);
  const THEME_MAP: Record<'light' | 'dark', { text: string; muted: string; bg: string }> = {
    light: { text: '#0f172a', muted: '#475569', bg: '#f8fafc' },
    dark: { text: '#d4d4d4', muted: '#646669', bg: '#0f0f1a' },
  };

  const themeColors = THEME_MAP[usedTheme];
  // Override color variables with theme values (inline styles win over CSS selectors)
  root.style.setProperty('--settings-text', themeColors.text);
  root.style.setProperty('--settings-muted', themeColors.muted);
  root.style.setProperty('--settings-bg', themeColors.bg);
  root.dataset.theme = usedTheme;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const saved = loadSettings();
    setSettings(saved);
    applySettings(saved);
  }, []);

  const setFontFamily = useCallback((fontFamily: FontFamily) => {
    setSettings(prev => {
      const next = { ...prev, fontFamily };
      applySettings(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const setFontSize = useCallback((fontSize: 'small' | 'medium' | 'large') => {
    setSettings(prev => {
      const next = { ...prev, fontSize };
      applySettings(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const setContrast = useCallback((contrast: ContrastLevel) => {
    setSettings(prev => {
      const next = { ...prev, contrast };
      applySettings(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings(prev => {
      const next = { ...prev, theme };
      applySettings(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULTS);
    applySettings(DEFAULTS);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS)); } catch {}
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, setFontFamily, setFontSize, setContrast, setTheme, resetSettings, isOpen, setIsOpen }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
}
