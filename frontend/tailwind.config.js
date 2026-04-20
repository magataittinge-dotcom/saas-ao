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
        sans:    ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // Design system palette — light mode SaaS
        ds: {
          bg:        '#FFFFFF',
          'bg-2':    '#F8FAFC',
          'bg-3':    '#F1F5F9',
          'bg-elevated': '#FFFFFF',
          sidebar:   '#FFFFFF',
          // Text hierarchy
          text:      '#0F172A',
          'text-1b': '#1E293B',
          'text-2':  '#64748B',
          'text-3':  '#94A3B8',
          'text-muted': '#94A3B8',
          'text-dim':   '#CBD5E1',
          // Primary palette
          cyan:      '#0EA5E9',
          teal:      '#10B981',
          blue:      '#0EA5E9',
          'blue-light': '#38BDF8',
          accent:    '#0EA5E9',
          'accent-light': '#0284C7',
          indigo:    '#6366F1',
          violet:    '#8B5CF6',
          purple:    '#A78BFA',
          // Semantic
          success:   '#10B981',
          'success-light': '#059669',
          'success-lighter': '#047857',
          warning:   '#F59E0B',
          'warning-light': '#D97706',
          'warning-lighter': '#B45309',
          danger:    '#EF4444',
          'danger-light': '#DC2626',
          // Borders
          'border-subtle': '#E2E8F0',
          'border-hover':  '#CBD5E1',
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
        'gradient-cta':     'linear-gradient(135deg, #0EA5E9, #10B981)',
        'gradient-cta-h':   'linear-gradient(90deg, #0EA5E9, #10B981)',
        'gradient-teal':    'linear-gradient(135deg, #10B981, #0EA5E9)',
        'gradient-success': 'linear-gradient(135deg, #10B981, #0EA5E9)',
        'gradient-subtle':  'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(16,185,129,0.05))',
        'gradient-violet':  'linear-gradient(135deg, #8B5CF6, #0EA5E9)',
      },
      boxShadow: {
        'glow-cyan':   '0 0 12px rgba(14,165,233,0.15)',
        'glow-teal':   '0 0 12px rgba(16,185,129,0.12)',
        'glow-sm':     '0 0 8px rgba(14,165,233,0.10)',
        'glow-violet': '0 0 12px rgba(139,92,246,0.15)',
        'card':        '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover':  '0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(14,165,233,0.08)',
        'glass':       '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
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
