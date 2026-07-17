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
        sans:    ['"Geist Sans"', 'system-ui', 'sans-serif'],
        display: ['"Geist Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"Geist Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // Design system palette — LUMEN (verre technique au crépuscule)
        ds: {
          bg:        '#0F1218',
          'bg-2':    '#10141B',
          'bg-3':    '#151A23',
          'bg-elevated': '#1C222D',
          sidebar:   '#0A0C11',
          surface:   '#151A23',
          'surface-2': '#1C222D',
          'surface-3': '#232B38',
          // Text hierarchy — blanc-gris
          text:      '#F4F6FA',
          'text-1b': '#E8EBF2',
          'text-2':  '#9BA4B5',
          'text-3':  '#788295',
          'text-muted': '#788295',
          'text-dim':   '#5C6678',
          // « cyan » historique = désormais la lumière argentée (zéro couleur de marque)
          cyan:      '#E4E9F2',
          'cyan-light': '#FFFFFF',
          'cyan-dark': '#C3CCDC',
          accent:    '#E4E9F2',
          lum:       '#E4E9F2',
          'lum-dim': '#9FA9BC',
          // Statuts métier — seule exception chromatique
          success:   '#6EE7A8',
          warning:   '#F5C26B',
          danger:    '#F58E86',
          'danger-light': '#FF9E96',
          'gagne':   '#6EE7A8',
          // Filets
          'border-subtle': 'rgba(186,205,234,.13)',
          'border-hover':  'rgba(186,205,234,.23)',
        },
        // Aliases legacy edge-* (refactor-v2) → Lumen
        edge: {
          void:     '#0A0C11',
          graphite: '#0F1218',
          panel:    '#151A23',
          slate:    '#1C222D',
          lumen:    '#E4E9F2',
          'lumen-300': '#FFFFFF',
          'lumen-500': '#9FA9BC',
          text:     '#F4F6FA',
          'text-2': '#9BA4B5',
          'text-3': '#788295',
          success:  '#6EE7A8',
          warning:  '#F5C26B',
          danger:   '#F58E86',
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
        'gradient-signature': 'linear-gradient(135deg, #1C222D 0%, #232B38 55%, #3A4556 100%)',
        'gradient-cyan':      'linear-gradient(90deg, #9FA9BC, #E4E9F2)',
        'gradient-subtle':    'linear-gradient(135deg, rgba(228,233,242,0.04), rgba(228,233,242,0.08))',
        'gradient-lumen':     'linear-gradient(180deg, #FFFFFF 0%, #E2E7F0 100%)',
        'gradient-silver-text': 'linear-gradient(180deg, #FFFFFF 30%, #A2AEC4 100%)',
        'bottom-lit':         'radial-gradient(130% 115% at 50% 128%, rgba(255,255,255,.07), transparent 56%)',
      },
      boxShadow: {
        'glow-cyan':   '0 0 12px rgba(255,255,255,0.16)',
        'glow-sm':     '0 0 8px rgba(255,255,255,0.10)',
        'card':        '0 1px 2px rgba(0,0,0,0.5), 0 16px 40px -20px rgba(0,0,0,0.7)',
        'card-hover':  '0 1px 2px rgba(0,0,0,0.5), 0 20px 48px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(186,205,234,.23)',
        'glass':       '0 1px 2px rgba(0,0,0,0.5), 0 16px 40px -20px rgba(0,0,0,0.7)',
        'edge-light':  'inset 0 1px 0 rgba(255,255,255,.06)',
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
