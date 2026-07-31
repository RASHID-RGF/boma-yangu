import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: '#1a1a2e',
          hover: '#2a2a3e',
          active: '#e2b714',
        },
        monkey: {
          bg: '#0f0f1a',
          surface: '#1a1a2e',
          border: '#2a2a3e',
          gold: '#e2b714',
          text: '#d4d4d4',
          muted: '#646669',
          'sub-alt': '#2c2e3e',
        },
        // Dark-compatible gray scale for the dashboard
        gray: {
          50: '#16162a',
          100: '#1a1a2e',
          200: '#2a2a3e',
          300: '#3a3a4e',
          400: '#585858',
          500: '#646669',
          600: '#8a8a8a',
          700: '#a0a0a0',
          800: '#c0c0c0',
          900: '#d4d4d4',
          950: '#e8e8e8',
        },
        emerald: {
          50: '#0a2e1a',
          100: '#0d3520',
          200: '#0f4d2e',
          300: '#166534',
          400: '#15803d',
          500: '#10b981',
          600: '#34d399',
          700: '#6ee7b7',
          800: '#a7f3d0',
          900: '#d1fae5',
          950: '#ecfdf5',
        },
        blue: {
          50: '#0c1a2e',
          100: '#0f2340',
          200: '#1e3a5f',
          300: '#2563eb',
          400: '#3b82f6',
          500: '#60a5fa',
          600: '#93c5fd',
          700: '#bfdbfe',
          800: '#dbeafe',
          900: '#eff6ff',
        },
        purple: {
          50: '#1a0e2e',
          100: '#2a1450',
          200: '#3b1f6e',
          300: '#7c3aed',
          400: '#8b5cf6',
          500: '#a78bfa',
          600: '#c4b5fd',
          700: '#ddd6fe',
          800: '#ede9fe',
          900: '#f5f3ff',
        },
        amber: {
          50: '#1a140e',
          100: '#2a2010',
          200: '#3a3010',
          300: '#d97706',
          400: '#f59e0b',
          500: '#fbbf24',
          600: '#fcd34d',
          700: '#fde68a',
          800: '#fef3c7',
          900: '#fffbeb',
        },
        kenya: {
          green: '#006600',
          red: '#BB0000',
          black: '#000000',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(226, 183, 20, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(226, 183, 20, 0.03) 1px, transparent 1px)',
        'glow-radial': 'radial-gradient(ellipse at center, rgba(226, 183, 20, 0.08) 0%, transparent 60%)',
      },
      backgroundSize: {
        'grid': '60px 60px',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(226, 183, 20, 0.15)',
        'glow-lg': '0 0 40px rgba(226, 183, 20, 0.2)',
        'card': '0 0 0 1px rgba(226, 183, 20, 0.05)',
        'card-hover': '0 0 0 1px rgba(226, 183, 20, 0.2), 0 20px 40px -12px rgba(0, 0, 0, 0.5)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(226, 183, 20, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(226, 183, 20, 0.2)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'typing': {
          from: { width: '0' },
          to: { width: '100%' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.6s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'typing': 'typing 3.5s steps(40, end)',
        'blink': 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
