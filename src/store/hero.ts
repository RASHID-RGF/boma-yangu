import { create } from 'zustand';

/** Default matches the original hero look — brightness(0.45). */
export const HERO_BRIGHTNESS_DEFAULT = 0.45;
/** 1 = the photo exactly as it is in the source file (public/hero.jpeg). */
export const HERO_BRIGHTNESS_MIN = 0.3;
export const HERO_BRIGHTNESS_MAX = 1.5;

const STORAGE_KEY = 'boma-yangu:hero-brightness';

interface HeroStore {
  /** Brightness multiplier for the hero photo (0.3 – 1.5, 1 = untouched). */
  brightness: number;
  setBrightness: (value: number) => void;
  resetBrightness: () => void;
  /** Loads the saved preference once, after hydration. */
  hydrate: () => void;
}

export const useHeroStore = create<HeroStore>((set, get) => ({
  brightness: HERO_BRIGHTNESS_DEFAULT,

  setBrightness: (value) => {
    const clamped = Math.min(HERO_BRIGHTNESS_MAX, Math.max(HERO_BRIGHTNESS_MIN, value));
    set({ brightness: clamped });
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Storage unavailable (private mode) — the slider still works for this visit.
    }
  },

  resetBrightness: () => get().setBrightness(HERO_BRIGHTNESS_DEFAULT),

  hydrate: () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      set({ brightness: Math.min(HERO_BRIGHTNESS_MAX, Math.max(HERO_BRIGHTNESS_MIN, parsed)) });
    } catch {
      // Ignore unreadable storage.
    }
  },
}));
