import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useChoixTheme, type ChoixTheme } from '@/lib/theme'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { Interrupteur } from '@/components/ui/interrupteur'

/** Les trois choix du thème, dans l'ordre : sans choix enregistré, c'est « Système ». */
export const OPTIONS_THEME: { valeur: ChoixTheme; libelle: string; icone: LucideIcon }[] = [
  { valeur: 'system', libelle: 'Système', icone: Monitor },
  { valeur: 'light', libelle: 'Clair', icone: Sun },
  { valeur: 'dark', libelle: 'Nuit', icone: Moon },
]

/** Classes d'un segment : le choisi est une surface neutre et un texte plein, jamais un aplat d'accent (P1). */
export const classeSegmentTheme = (choisi: boolean) => cn(
  'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors duration-fast ease-survol',
  choisi ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-1 hover:text-fg',
)

/**
 * Le choix du thème, « Système · Clair · Nuit » : trois segments (tiroir « Compte » au téléphone). Le menu du compte du bureau
 * pose les mêmes options dans son menu (MenuCompte.tsx). Le choix est enregistré dans ce navigateur (lib/theme.ts).
 */
export default function BasculeTheme({ className }: { className?: string }) {
  const [choix, choisir] = useChoixTheme()
  return (
    <div role="radiogroup" aria-label="Thème" className={cn('flex gap-1 rounded-lg border border-bord p-1', className)}>
      {OPTIONS_THEME.map(({ valeur, libelle, icone: Icone }) => (
        <button key={valeur} type="button" role="radio" aria-checked={choix === valeur} onClick={() => choisir(valeur)} className={classeSegmentTheme(choix === valeur)}>
          <Icone size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          {libelle}
        </button>
      ))}
    </div>
  )
}

/** Le réglage « Animer le fond » : coupé, l'aurore reste une image fixe (en plus de « réduire les animations » du système). */
export function ReglageAnimerFond({ className }: { className?: string }) {
  const animerFond = useUIStore((s) => s.animerFond)
  const setAnimerFond = useUIStore((s) => s.setAnimerFond)
  return <Interrupteur className={className} libelle="Animer le fond" coche={animerFond} onChange={setAnimerFond} />
}
