import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeEcran } from '@/lib/themeEcran'
import { classeChamp } from './champ'

export interface OptionListe { valeur: string; libelle: string; desactive?: boolean }

/**
 * Liste déroulante (VEILLE-DESIGN P14) : la même forme que le champ (rectangle de 14 px, 44 px, trait de champ), un chevron
 * dessiné ; la liste s'ouvre en surface flottante, clavier et lecteur d'écran fournis par Radix. Remplace tout `<select>`.
 * `libelle` : le nom accessible quand aucun `GroupeChamp` ne l'entoure.
 */
export function ListeDeroulante({ valeur, onChange, options, placeholder = 'Choisir', libelle, disabled, className, id, ...aria }: {
  valeur: string | undefined
  onChange: (valeur: string) => void
  options: readonly OptionListe[]
  placeholder?: string
  libelle?: string
  disabled?: boolean
  className?: string
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const theme = useThemeEcran()
  return (
    <Select.Root value={valeur} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger id={id} aria-label={libelle} {...aria}
        className={cn(classeChamp, 'flex h-11 items-center justify-between gap-2 text-left data-[placeholder]:text-fg-3 data-[state=open]:border-accent-ring', className)}>
        <span className="min-w-0 truncate"><Select.Value placeholder={placeholder} /></span>
        <Select.Icon asChild><ChevronDown aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-3" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={6} data-theme={theme}
          className="menu-flottant z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-bord bg-surface-pop text-fg shadow-flottant">
          <Select.Viewport className="p-1">
            {options.map((o) => (
              <Select.Item key={o.valeur} value={o.valeur} disabled={o.desactive}
                className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-md px-3 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-1 data-[state=checked]:font-semibold data-[disabled]:text-fg-disabled">
                <Select.ItemText>{o.libelle}</Select.ItemText>
                <Select.ItemIndicator><Check aria-hidden size={16} strokeWidth={2} className="text-accent-ui" /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
