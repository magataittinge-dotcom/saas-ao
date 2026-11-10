import * as React from 'react'
import * as Checkbox from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const RANGEE = 'flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:text-fg-disabled'

/** Case à cocher : un choix à valider (pour un réglage qui s'applique tout de suite : `Interrupteur`). Toute la rangée est la cible. */
export function CaseACocher({ libelle, coche, onChange, disabled, className }: { libelle: React.ReactNode; coche: boolean; onChange: (coche: boolean) => void; disabled?: boolean; className?: string }) {
  return (
    <label className={cn(RANGEE, className)}>
      <Checkbox.Root checked={coche} onCheckedChange={(v) => onChange(v === true)} disabled={disabled}
        className="grid size-5 shrink-0 place-items-center rounded border border-bord-champ bg-surface-0 text-accent-on transition-colors duration-fast ease-survol hover:border-fg-3 data-[state=checked]:border-accent-ui data-[state=checked]:bg-accent-ui disabled:border-bord-2 disabled:bg-surface-1">
        <Checkbox.Indicator><Check aria-hidden size={14} strokeWidth={3} /></Checkbox.Indicator>
      </Checkbox.Root>
      <span className="min-w-0">{libelle}</span>
    </label>
  )
}

/**
 * Boutons radio : un choix parmi quelques-uns, tous visibles. Flèches et Tab gérés par le navigateur (le contrôle natif est
 * là, masqué ; le rond est dessiné). Le choisi : anneau et point `--accent-ui`, jamais un aplat.
 */
export function GroupeRadio<V extends string>({ libelle, valeur, onChange, options, disabled, className }: {
  libelle: string
  valeur: V | undefined
  onChange: (valeur: V) => void
  options: readonly { valeur: V; libelle: React.ReactNode; aide?: React.ReactNode }[]
  disabled?: boolean
  className?: string
}) {
  const nom = React.useId()
  return (
    <div role="radiogroup" aria-label={libelle} className={cn('grid gap-0.5', className)}>
      {options.map((o) => (
        <label key={o.valeur} className={RANGEE}>
          <input type="radio" name={nom} value={o.valeur} checked={valeur === o.valeur} disabled={disabled} onChange={() => onChange(o.valeur)} className="peer sr-only" />
          <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-pilule border border-bord-champ bg-surface-0 transition-colors duration-fast ease-survol peer-checked:border-accent-ui peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ring peer-checked:[&>span]:bg-accent-ui">
            <span className="size-2.5 rounded-pilule" />
          </span>
          <span className="min-w-0">{o.libelle}{o.aide && <span className="block text-xs text-fg-3">{o.aide}</span>}</span>
        </label>
      ))}
    </div>
  )
}
