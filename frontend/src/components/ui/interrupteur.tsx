import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Interrupteur : un réglage qui s'applique tout de suite (jamais pour un choix à valider : là, une case à cocher).
 * Toute la rangée est la cible (44 px). Allumé : la piste prend `--accent-ui` (un contrôle, pas un aplat d'action).
 */
export function Interrupteur({ libelle, coche, onChange, disabled, aide, className }: {
  libelle: string
  coche: boolean
  onChange: (coche: boolean) => void
  disabled?: boolean
  aide?: string
  className?: string
}) {
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={coche}
      aria-describedby={aide ? `${id}-aide` : undefined}
      disabled={disabled}
      onClick={() => onChange(!coche)}
      className={cn('group flex min-h-11 w-full items-center justify-between gap-3 rounded-md text-left text-sm font-medium text-fg transition-colors duration-fast ease-survol disabled:cursor-not-allowed disabled:opacity-45', className)}
    >
      <span className="min-w-0">
        {libelle}
        {aide && <span id={`${id}-aide`} className="block text-xs font-normal text-fg-3">{aide}</span>}
      </span>
      <span aria-hidden className={cn('relative h-6 w-10 shrink-0 rounded-pilule border transition-colors duration-survol ease-survol', coche ? 'border-accent-ui bg-accent-ui' : 'border-bord-champ bg-surface-1 group-hover:bg-surface-2')}>
        <span className={cn('absolute left-0.5 top-0.5 size-[18px] rounded-pilule bg-surface-0 shadow-card transition-transform duration-survol ease-survol', coche && 'translate-x-4')} />
      </span>
    </button>
  )
}
