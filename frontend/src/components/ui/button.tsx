import * as React from 'react'
import { Bouton, classesBouton, type VarianteBouton } from './bouton'

// ALIAS MINCE (ancien nom shadcn). Le bouton du système est `Bouton` (./bouton.tsx) : ne plus importer ce fichier.
// Les anciennes variantes renvoient aux cinq du système ; les anciennes tailles n'existent plus (44 px partout).
type AncienneVariante = 'default' | 'signature' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
const VERS: Record<AncienneVariante, VarianteBouton> = {
  default: 'principal', signature: 'principal', destructive: 'danger', outline: 'secondaire', secondary: 'secondaire', ghost: 'discret', link: 'lien',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AncienneVariante | null
  size?: 'default' | 'sm' | 'lg' | 'icon' | null
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant, size, className, ...props }, ref) => (
  <Bouton ref={ref} variante={VERS[variant ?? 'default']} className={size === 'icon' ? `w-11 px-0 ${className ?? ''}` : className} {...props} />
))
Button.displayName = 'Button'

/** Ancienne fabrique de classes (cva) : renvoie les classes du bouton du système. */
const buttonVariants = ({ variant, className }: { variant?: AncienneVariante | null; size?: string | null; className?: string } = {}) =>
  classesBouton(VERS[variant ?? 'default'], className)

export { Button, buttonVariants }
