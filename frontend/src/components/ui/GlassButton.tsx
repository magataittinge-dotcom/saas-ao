import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bouton } from './bouton'

// ALIAS MINCE, sans aucun import dans le code (à supprimer : décision du coordinateur). Le verre décoratif est sorti du
// système : ce bouton est le `Bouton` secondaire (./bouton.tsx).
export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string | null
  size?: string | null
  icon?: LucideIcon
  iconPosition?: 'left' | 'right'
  loading?: boolean
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ variant: _variant, size: _size, icon: Icone, iconPosition = 'left', loading = false, children, ...props }, ref) => (
    <Bouton ref={ref} variante="secondaire" enCours={loading} {...props}>
      {Icone && iconPosition === 'left' && <Icone aria-hidden />}
      {children}
      {Icone && iconPosition === 'right' && <Icone aria-hidden />}
    </Bouton>
  ),
)
GlassButton.displayName = 'GlassButton'
