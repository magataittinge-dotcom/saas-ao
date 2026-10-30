import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * GlassButton — bouton verre avec halo lumineux au survol (Lumen).
 *
 * Style : fond verre (backdrop-blur + fond semi-transparent), bordure subtile,
 * et un halo argenté (--lum) doux qui s'intensifie au hover.
 * Entièrement token-driven (palette ds-*, thème sombre Lumen).
 */
const glassButton = cva(
  // base — verre, glow doux permanent, transition fluide
  [
    'relative inline-flex items-center justify-center gap-2 select-none',
    'rounded-xl font-medium whitespace-nowrap [@media(pointer:coarse)]:min-h-11',
    'border backdrop-blur-md',
    'shadow-glow-sm transition-all duration-300 ease-smooth',
    'motion-safe:hover:-translate-y-0.5 hover:shadow-glow-cyan',
    
    'active:translate-y-0 active:shadow-glow-sm',
    'disabled:pointer-events-none disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none',
  ],
  {
    variants: {
      variant: {
        // verre clair translucide — usage par défaut
        glass: [
          'bg-[var(--glass-fill)] text-fg-2',
          'border-bord-2',
          'hover:bg-surface-1 hover:border-accent-ui',
        ],
        // verre teinté cyan — call-to-action premium
        primary: [
          'bg-accent-tint text-accent-text',
          'border-accent-tint-2',
          'hover:bg-accent-tint-2 hover:border-accent-ui',
        ],
        // verre neutre slate — action secondaire
        ghost: [
          'bg-transparent text-fg-2',
          'border-transparent shadow-none',
          'hover:bg-surface-1 hover:text-fg hover:shadow-glow-sm',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-7 text-base',
        icon: 'h-11 w-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'glass',
      size: 'md',
    },
  }
)

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButton> {
  /** Icône lucide affichée à gauche du libellé (ou seule en taille `icon`). */
  icon?: LucideIcon
  /** Position de l'icône par rapport au texte. */
  iconPosition?: 'left' | 'right'
  /** Affiche un spinner et désactive le bouton. */
  loading?: boolean
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      className,
      variant,
      size,
      icon: Icon,
      iconPosition = 'left',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const iconSize = size === 'lg' ? 18 : 16
    const showLeft = Icon && iconPosition === 'left' && !loading
    const showRight = Icon && iconPosition === 'right' && !loading

    return (
      <button
        ref={ref}
        className={cn(glassButton({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* reflet de verre — fin liseré lumineux en haut */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-accent-tint-2 to-transparent"
        />
        {loading && <Loader2 size={iconSize} className="animate-spin" />}
        {showLeft && <Icon size={iconSize} />}
        {children}
        {showRight && <Icon size={iconSize} />}
      </button>
    )
  }
)

GlassButton.displayName = 'GlassButton'
