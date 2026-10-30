import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Pastille : pilule de 14 px, texte et fond d'un même ton (contraste 4,5:1 vérifié dans les deux thèmes).
// Vocabulaire produit : « À joindre », « À confirmer », « Facultatif » = info ; « À renouveler » = warning ;
// « Prêt » = success ; le rouge (danger) est réservé à l'erreur bloquante.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pilule border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "border-bord-2 bg-surface-1 text-fg-2",
        accent: "border-accent-tint-2 bg-accent-tint text-accent-text",
        info: "border-info-border bg-info-bg text-info",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
        outline: "border-input bg-transparent text-fg-2",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
