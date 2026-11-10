import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Un bloc d'une étape : un sous-titre en capitales (celui des groupes de « Mon entreprise »), puis son contenu sur toute
 * la largeur, sur une ou deux colonnes. Au téléphone : toujours une colonne.
 * `action` : un lien ou un bouton secondaire à droite du sous-titre (« Tout afficher », « Copier »…).
 */
export function SectionEtape({ titre, colonnes = 1, description, action, children, className, classeContenu }: {
  titre: string
  colonnes?: 1 | 2
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  /** Classes ajoutées à la grille du contenu (ex. un enfant seul qui prend les deux colonnes). */
  classeContenu?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} data-section-etape="" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={id} className="text-xs font-semibold text-fg-3">{titre}</h3>
        {action}
      </div>
      {description && <p className="text-sm text-fg-2">{description}</p>}
      <div className={cn('grid min-w-0 gap-3.5', colonnes === 2 && 'md:grid-cols-2', classeContenu)}>{children}</div>
    </section>
  )
}

export default SectionEtape
