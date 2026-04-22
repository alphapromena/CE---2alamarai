import type { Config } from 'tailwindcss';
import logical from 'tailwindcss-logical';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg)',
          subtle: 'var(--color-bg-subtle)',
          muted: 'var(--color-bg-muted)',
          hover: 'var(--color-bg-hover)',
          inverse: 'var(--color-bg-inverse)',
          'inverse-hover': 'var(--color-bg-inverse-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
          inverse: 'var(--color-border-inverse)',
        },
        fg: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          inverse: 'var(--color-text-inverse)',
          'inverse-secondary': 'var(--color-text-inverse-secondary)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          active: 'var(--color-accent-active)',
          subtle: 'var(--color-accent-subtle)',
          border: 'var(--color-accent-border)',
          strong: 'var(--color-accent-strong)',
        },
        'accent-2': {
          DEFAULT: 'var(--color-accent-2)',
          subtle: 'var(--color-accent-2-subtle)',
          border: 'var(--color-accent-2-border)',
          strong: 'var(--color-accent-2-strong)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          subtle: 'var(--color-success-subtle)',
          border: 'var(--color-success-border)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          subtle: 'var(--color-warning-subtle)',
          border: 'var(--color-warning-border)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          subtle: 'var(--color-danger-subtle)',
          border: 'var(--color-danger-border)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          subtle: 'var(--color-info-subtle)',
          border: 'var(--color-info-border)',
        },
        // Raw brand colors — available but prefer semantic tokens above
        brand: {
          navy: 'var(--color-navy-deep)',
          cyan: 'var(--color-cyan-wave)',
          teal: 'var(--color-teal-flow)',
          mint: 'var(--color-mint)',
          lime: 'var(--color-lime)',
          sun: 'var(--color-sun)',
          ink: 'var(--color-ink)',
          slate: 'var(--color-slate)',
        },
      },
      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-strip': 'var(--gradient-strip)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        'sans-ar': [
          'var(--font-sans-ar)',
          'IBM Plex Sans Arabic',
          'system-ui',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        md: ['15px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        '2xl': ['22px', { lineHeight: '30px', letterSpacing: '-0.015em' }],
        '3xl': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '44px', letterSpacing: '-0.025em' }],
        '5xl': ['48px', { lineHeight: '56px', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        card: 'var(--shadow-card)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-in-slow': 'fade-in 300ms ease-out both',
        'fade-in-slow-delay-300':
          'fade-in 300ms ease-out 300ms both',
        'fade-up': 'fade-up 200ms ease-out both',
        'fade-up-slow': 'fade-up 300ms ease-out both',
        'fade-up-delay-60': 'fade-up 240ms ease-out 60ms both',
        'fade-up-delay-100': 'fade-up 300ms ease-out 100ms both',
        'fade-up-delay-200': 'fade-up 300ms ease-out 200ms both',
        'scale-in': 'scale-in 150ms ease-out both',
      },
      transitionTimingFunction: {
        bounce: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [logical],
};

export default config;
