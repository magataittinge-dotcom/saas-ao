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
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // ── SYNORIX EDGE — surfaces graphite, lumière cyan ─────────
        edge: {
          void:     '#0A0B0D',
          graphite: '#121417',
          panel:    '#1A1D21',
          slate:    '#232730',
          lumen:    '#22D3EE',
          'lumen-300': '#67E8F9',
          'lumen-500': '#06B6D4',
          text:     '#E7EAEE',
          'text-2': '#9AA3AE',
          'text-3': '#6B7280',
          success:  '#34D399',
          warning:  '#FBBF24',
          danger:   '#F87171',
        },
        // Aliases legacy ds-* → Edge (les écrans token-first basculent seuls)
        ds: {
          bg:        '#1A1D21',            // surface carte (ex-blanc)
          'bg-2':    '#232730',            // hover / zone subtile
          'bg-3':    '#232730',
          'bg-elevated': '#232730',
          sidebar:   '#0A0B0D',
          // Text hierarchy (AA sur panel pour text / text-2)
          text:      '#E7EAEE',
          'text-1b': '#C9CFD6',
          'text-2':  '#9AA3AE',
          'text-3':  '#6B7280',
          'text-muted': '#6B7280',
          'text-dim':   '#4B5563',
          // La lumière — accent unique
          cyan:      '#22D3EE',
          'cyan-light': '#67E8F9',
          'cyan-dark': '#67E8F9',          // sur dark, l'emphase = PLUS lumineux
          accent:    '#22D3EE',
          // États métier (lisibles sur dark, conventions conservées)
          success:   '#34D399',
          warning:   '#FBBF24',
          danger:    '#F87171',
          'danger-light': '#F87171',
          'gagne':   '#34D399',
          // Hairlines (jamais de border épaisse)
          'border-subtle': 'rgba(255,255,255,0.06)',
          'border-hover':  'rgba(255,255,255,0.10)',
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
        'gradient-signature': 'radial-gradient(120% 80% at 50% 100%, rgba(34,211,238,0.08), transparent 60%), linear-gradient(180deg, #121417, #1A1D21)',
        'gradient-cyan':      'linear-gradient(90deg, #06B6D4, #22D3EE)',
        'gradient-subtle':    'linear-gradient(135deg, rgba(34,211,238,0.05), rgba(34,211,238,0.10))',
        'panel-light':        'radial-gradient(120% 80% at 50% 100%, rgba(34,211,238,0.05), transparent 60%)',
      },
      boxShadow: {
        'glow-cyan':   '0 0 12px rgba(34,211,238,0.18)',
        'glow-sm':     '0 0 8px rgba(34,211,238,0.12)',
        'card':        'inset 0 0 0 1px rgba(255,255,255,0.06)',
        'card-hover':  'inset 0 0 0 1px rgba(255,255,255,0.10), 0 8px 24px -12px rgba(34,211,238,0.35)',
        'glass':       'inset 0 0 0 1px rgba(255,255,255,0.06)',
        'hairline':    'inset 0 0 0 1px rgba(255,255,255,0.06)',
        'horizon':     'inset 0 -2px 0 0 #22D3EE, 0 8px 24px -12px rgba(34,211,238,0.35)',
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
