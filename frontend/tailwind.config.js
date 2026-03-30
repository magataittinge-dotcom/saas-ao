/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // Design system palette — dark futuristic analytics
        ds: {
          bg:      '#080B12',
          'bg-2':  '#0F172A',
          'bg-3':  '#1E293B',
          sidebar: '#0B0F17',
          text:    '#E2E8F0',
          'text-2':'#64748B',
          'text-3':'#475569',
          cyan:    '#0EA5E9',
          teal:    '#00D4AA',
          blue:    '#3B82F6',
          indigo:  '#6366F1',
          success: '#10B981',
          warning: '#F59E0B',
          danger:  '#EF4444',
          'border-subtle': 'rgba(14,165,233,0.10)',
          'border-hover':  'rgba(14,165,233,0.25)',
        },
        // shadcn/ui vars — keep for compatibility
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg:  'var(--radius)',
        md:  'calc(var(--radius) - 2px)',
        sm:  'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      backgroundImage: {
        'gradient-cta':     'linear-gradient(135deg, #0EA5E9, #3B82F6)',
        'gradient-cta-h':   'linear-gradient(90deg, #0EA5E9, #3B82F6)',
        'gradient-teal':    'linear-gradient(135deg, #00D4AA, #0EA5E9)',
        'gradient-success': 'linear-gradient(135deg, #10B981, #0EA5E9)',
        'gradient-subtle':  'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(0,212,170,0.08))',
      },
      boxShadow: {
        'glow-cyan':   '0 0 20px rgba(14,165,233,0.35)',
        'glow-teal':   '0 0 20px rgba(0,212,170,0.30)',
        'glow-sm':     '0 0 12px rgba(14,165,233,0.20)',
        'card':        '0 4px 24px rgba(0,0,0,0.5)',
        'card-hover':  '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(14,165,233,0.15)',
        'glass':       '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backdropBlur: {
        xs:      '4px',
        DEFAULT: '16px',
        lg:      '24px',
        xl:      '32px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        wave: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%':      { transform: 'rotate(-15deg)' },
          '40%':      { transform: 'rotate(15deg)' },
          '60%':      { transform: 'rotate(-10deg)' },
          '80%':      { transform: 'rotate(8deg)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse_glow: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'wave':           'wave 1.5s ease-in-out',
        'fade-in':        'fade-in 0.3s ease-out',
        'shimmer':        'shimmer 2s linear infinite',
        'pulse-glow':     'pulse_glow 2s ease-in-out infinite',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
}
