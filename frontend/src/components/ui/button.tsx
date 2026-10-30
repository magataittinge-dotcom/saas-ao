import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Boutons du système (SYSTEME-DESIGN §7) : états repos / survol / actif / focus / désactivé.
// Focus : anneau global 2 px de l'accent (styles/tokens.css). Cible tactile : 44 px minimum
// sur écran tactile. Un seul bouton « signature » (dégradé + halo) par écran.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-base ease-lien active:scale-[.985] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [@media(pointer:coarse)]:min-h-11",
  {
    variants: {
      variant: {
        // principal : dégradé accent-700 → accent-600 (nuit : accent-600), texte blanc
        default:
          "bg-accent-fill text-accent-on shadow-[inset_0_1px_0_rgba(255,255,255,.22)] hover:[background-image:var(--accent-fill-hover)]",
        // signature : pilule, reflets internes et halo teinté (SYSTEME-DESIGN §7, CTA)
        signature:
          "rounded-pilule bg-accent-fill px-6 text-accent-on shadow-cta hover:[background-image:var(--accent-fill-hover)] motion-safe:hover:-translate-y-px",
        destructive:
          "bg-danger-solid text-white hover:opacity-90",
        outline:
          "border border-input bg-surface-0 text-fg font-medium hover:bg-surface-1",
        secondary:
          "bg-surface-1 text-fg hover:bg-surface-2",
        ghost: "font-medium text-fg-2 hover:bg-surface-1 hover:text-fg",
        link: "h-auto rounded-xs px-0 font-medium text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-[13px]",
        lg: "h-12 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
