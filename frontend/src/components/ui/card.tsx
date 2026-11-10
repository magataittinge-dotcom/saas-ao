import * as React from 'react'
import { cn } from '@/lib/utils'
import { Carte, TitreCarte } from './carte'

// ALIAS MINCE (anciens noms shadcn). La carte du système est `Carte` (./carte.tsx) : ne plus importer ce fichier.
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }>(
  ({ interactive, ...props }, ref) => <Carte ref={ref} sansMarge cliquable={interactive} {...props} />,
)
Card.displayName = 'Card'
const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1.5 p-6 pb-3', className)} {...props} />
const CardTitle = TitreCarte
const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn('text-sm text-fg-2', className)} {...props} />
const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-6 pt-0', className)} {...props} />
const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex items-center gap-2 p-6 pt-0', className)} {...props} />

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
