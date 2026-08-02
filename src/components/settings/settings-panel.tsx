'use client';

import { useSettings, type FontFamily, type ContrastLevel } from '@/lib/settings/context';
import { Settings, X, Type, Sun, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';

const FONT_OPTIONS: { value: FontFamily; label: string; preview: string }[] = [
  { value: 'inter', label: 'Inter', preview: 'Inter' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono', preview: 'Mono' },
  { value: 'system', label: 'System UI', preview: 'System' },
];

const FONT_SIZE_OPTIONS = [
  { value: 'small' as const, label: 'S', size: '13px' },
  { value: 'medium' as const, label: 'M', size: '14px' },
  { value: 'large' as const, label: 'L', size: '16px' },
];

const CONTRAST_OPTIONS: { value: ContrastLevel; label: string; desc: string }[] = [
  { value: 'low', label: 'Low', desc: 'Soft' },
  { value: 'medium', label: 'Medium', desc: 'Balanced' },
  { value: 'high', label: 'High', desc: 'Crisp' },
];

export function SettingsToggleButton() {
  const settingsCtx = useSettings();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !settingsCtx) return null;
  const { setIsOpen } = settingsCtx;

  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-[#1a1a2e] border border-[#e2b714]/20 flex items-center justify-center text-[#e2b714] hover:bg-[#e2b714]/10 hover:border-[#e2b714]/40 transition-all duration-300 shadow-lg shadow-black/30 group"
      title="Settings"
    >
      <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
    </button>
  );
}

export function SettingsPanel() {
  const settingsCtx = useSettings();
  const [activeTab, setActiveTab] = useState<'font' | 'contrast'>('font');

  if (!settingsCtx || !settingsCtx.isOpen) return null;
  const { settings, setFontFamily, setFontSize, setContrast, resetSettings, setIsOpen } = settingsCtx;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div className="fixed bottom-24 right-6 z-50 w-80 animate-fade-in">
        <div className="relative bg-[#1a1a2e]/95 backdrop-blur-xl border border-[#e2b714]/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2b714]/[0.06]">
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 text-[#e2b714]" />
              <span className="text-sm font-semibold text-[#d4d4d4]">Settings</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[#585858] hover:text-[#d4d4d4] hover:bg-[#e2b714]/5 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#e2b714]/[0.06]">
            <button
              onClick={() => setActiveTab('font')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all ${
                activeTab === 'font'
                  ? 'text-[#e2b714] border-b-2 border-[#e2b714]'
                  : 'text-[#585858] hover:text-[#646669]'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              Font
            </button>
            <button
              onClick={() => setActiveTab('contrast')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all ${
                activeTab === 'contrast'
                  ? 'text-[#e2b714] border-b-2 border-[#e2b714]'
                  : 'text-[#585858] hover:text-[#646669]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              Contrast
            </button>
          </div>

          <div className="p-5 space-y-5">
            {activeTab === 'font' && (
              <>
                {/* Font Family */}
                <div>
                  <p className="text-[10px] font-semibold text-[#585858] uppercase tracking-wider mb-3">Font Family</p>
                  <div className="grid grid-cols-3 gap-2">
                    {FONT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFontFamily(opt.value)}
                        className={`relative py-3 px-3 rounded-xl text-xs font-medium transition-all duration-200 border ${
                          settings.fontFamily === opt.value
                            ? 'bg-[#e2b714]/10 border-[#e2b714]/30 text-[#e2b714]'
                            : 'bg-[#0f0f1a] border-[#2a2a3e] text-[#646669] hover:border-[#e2b714]/20 hover:text-[#d4d4d4]'
                        }`}
                      >
                        <span style={{ fontFamily: opt.value === 'inter' ? "'Inter', sans-serif" : opt.value === 'jetbrains-mono' ? "'JetBrains Mono', monospace" : 'system-ui' }}>
                          {opt.preview}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div>
                  <p className="text-[10px] font-semibold text-[#585858] uppercase tracking-wider mb-3">Font Size</p>
                  <div className="flex gap-2">
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFontSize(opt.value)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
                          settings.fontSize === opt.value
                            ? 'bg-[#e2b714]/10 border-[#e2b714]/30 text-[#e2b714]'
                            : 'bg-[#0f0f1a] border-[#2a2a3e] text-[#646669] hover:border-[#e2b714]/20 hover:text-[#d4d4d4]'
                        }`}
                        style={{ fontSize: opt.size }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="bg-[#0f0f1a] rounded-xl p-3 border border-[#2a2a3e]">
                  <p className="text-[10px] text-[#585858] mb-1.5 font-mono">$ preview</p>
                  <p className="text-xs text-[#646669] leading-relaxed">
                    The quick brown fox jumps over the lazy dog.
                    <span className="text-[#e2b714]"> 1234567890</span>
                  </p>
                </div>
              </>
            )}

            {activeTab === 'contrast' && (
              <>
                {/* Contrast Level */}
                <div>
                  <p className="text-[10px] font-semibold text-[#585858] uppercase tracking-wider mb-3">Contrast Level</p>
                  <div className="flex gap-2">
                    {CONTRAST_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setContrast(opt.value)}
                        className={`flex-1 py-3 rounded-xl text-xs font-medium transition-all duration-200 border ${
                          settings.contrast === opt.value
                            ? 'bg-[#e2b714]/10 border-[#e2b714]/30 text-[#e2b714]'
                            : 'bg-[#0f0f1a] border-[#2a2a3e] text-[#646669] hover:border-[#e2b714]/20 hover:text-[#d4d4d4]'
                        }`}
                      >
                        <span className="text-sm">{opt.label}</span>
                        <p className="text-[10px] text-[#585858] mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contrast Preview */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-[#585858] uppercase tracking-wider">Preview</p>
                  <div className="bg-[#0f0f1a] rounded-xl p-4 border border-[#2a2a3e] space-y-2">
                    <div className="h-2 w-full rounded-full bg-[#2a2a3e] overflow-hidden">
                      <div className="h-full w-3/4 rounded-full bg-[#e2b714] transition-all" />
                    </div>
                    <div className="flex gap-2">
                      <div className="w-4 h-4 rounded bg-[#e2b714]/80" />
                      <div className="w-4 h-4 rounded bg-[#e2b714]/50" />
                      <div className="w-4 h-4 rounded bg-[#e2b714]/30" />
                      <div className="w-4 h-4 rounded bg-[#e2b714]/10" />
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#d4d4d4]">Primary text</span>
                      <span className="text-[#646669]">Muted text</span>
                      <span className="text-[#585858]">Subtle text</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Reset */}
            <button
              onClick={resetSettings}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-[#585858] hover:text-[#d4d4d4] hover:bg-[#e2b714]/5 border border-[#2a2a3e] transition-all duration-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
