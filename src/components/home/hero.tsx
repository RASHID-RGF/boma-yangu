'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Sun } from 'lucide-react';
import {
  HERO_BRIGHTNESS_DEFAULT,
  HERO_BRIGHTNESS_MAX,
  HERO_BRIGHTNESS_MIN,
  useHeroStore,
} from '@/store/hero';

/**
 * The hero photo layer + its contrast scrim.
 *
 * Replaces the old static `.hero-bg` div: the image is a real <img> inside an
 * overflow-hidden band so it can parallax on scroll without leaking past the
 * band, and its brightness is driven by the shared hero store so the slider
 * (HeroBrightnessControl) can raise or lower it live.
 */
export function HeroBackdrop() {
  const brightness = useHeroStore((s) => s.brightness);
  const hydrate = useHeroStore((s) => s.hydrate);
  const [offset, setOffset] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Parallax: the photo drifts slower than the page while scrolling.
  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setOffset(Math.min(window.scrollY, 500));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div className="absolute inset-x-0 top-0 h-[420px] md:h-[520px] overflow-hidden pointer-events-none z-0">
      <img
        src="/hero.jpeg"
        alt=""
        aria-hidden="true"
        className="absolute -top-[15%] left-0 w-full h-[130%] object-cover"
        style={{
          filter: `brightness(${brightness}) saturate(0.95)`,
          transform: `translate3d(0, ${offset * 0.1}px, 0)`,
          transition: 'filter 180ms ease-out',
          willChange: 'transform',
        }}
      />
      {/* Dark scrim that keeps the headline readable over any brightness. */}
      <div className="hero-overlay absolute inset-0 pointer-events-none" />
    </div>
  );
}

/**
 * Slider that lets each visitor brighten or dim the hero photo themselves.
 * 100% = the photo exactly as it is in public/hero.jpeg; the default (45%) is
 * the original hero look. The choice is remembered in localStorage.
 */
export function HeroBrightnessControl() {
  const brightness = useHeroStore((s) => s.brightness);
  const setBrightness = useHeroStore((s) => s.setBrightness);
  const resetBrightness = useHeroStore((s) => s.resetBrightness);
  const hydrate = useHeroStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const percent = Math.round(brightness * 100);

  return (
    <div className="mt-10 inline-flex items-center gap-2 sm:gap-3 rounded-full border border-[#e2b714]/25 bg-[#0f0f1a]/70 backdrop-blur px-3 sm:px-4 py-2.5 shadow-lg shadow-black/40">
      <Sun className="w-4 h-4 text-[#e2b714] shrink-0" />
      <label
        htmlFor="hero-brightness"
        className="text-xs text-[#a0a0a0] whitespace-nowrap hidden sm:inline"
      >
        Image brightness
      </label>
      <input
        id="hero-brightness"
        type="range"
        min={Math.round(HERO_BRIGHTNESS_MIN * 100)}
        max={Math.round(HERO_BRIGHTNESS_MAX * 100)}
        step={5}
        value={percent}
        onChange={(e) => setBrightness(Number(e.target.value) / 100)}
        className="w-28 sm:w-40 h-1.5 accent-[#e2b714] cursor-pointer"
        aria-label="Adjust hero image brightness"
      />
      <span className="text-xs font-mono text-[#d4d4d4] w-10 text-right tabular-nums">
        {percent}%
      </span>
      <button
        type="button"
        onClick={resetBrightness}
        aria-label="Reset brightness"
        title={`Reset to ${Math.round(HERO_BRIGHTNESS_DEFAULT * 100)}%`}
        className="p-1.5 rounded-full text-[#646669] hover:text-[#e2b714] hover:bg-[#e2b714]/10 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
