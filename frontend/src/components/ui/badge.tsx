import * as React from 'react'
import { PastilleCompte, PastilleEtat, type Sens } from './pastille'

// ALIAS MINCE (anciens noms). La pastille du système est `PastilleEtat` (./pastille.tsx) : ne plus importer ce fichier.
// Les anciennes variantes renvoient aux six sens.
type AncienneVariante = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'outline'
const VERS: Record<AncienneVariante, Sens> = { neutral: 'gris', accent: 'bleu', info: 'bleu', success: 'vert', warning: 'ambre', danger: 'rouge', outline: 'gris' }

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { variant?: AncienneVariante | null }

function Badge({ variant, ...props }: BadgeProps) {
  return <PastilleEtat sens={VERS[variant ?? 'neutral']} icone={null} {...props} />
}

const TONS: Record<string, Sens> = { warning: 'ambre', accent: 'bleu', success: 'vert', danger: 'rouge', rouge: 'rouge', ambre: 'ambre' }
function Pastille({ ton = 'warning', ...props }: { valeur?: number | string; ton?: 'warning' | 'accent' | 'success' | 'danger' | 'rouge' | 'ambre' } & React.HTMLAttributes<HTMLSpanElement>) {
  return <PastilleCompte sens={TONS[ton]} {...props} />
}

export { Badge, Pastille }
