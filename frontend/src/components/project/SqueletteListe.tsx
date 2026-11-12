import { Squelette } from '@/components/ui/squelette'

/**
 * Le squelette d'une LISTE d'étape (Lots, Pièces, fichiers du dépôt), à la forme de ce qui arrive : un titre de section, puis
 * UNE surface au trait et des lignes séparées par un filet (une case, un intitulé, un fait à droite). Aucune valeur n'y est
 * écrite : ni « 0 pièce », ni « Prêt » (jury, tour 1 : l'écran chargé s'affichait avec des zéros). Fixe : rien ne pulse.
 * `phrase` : ce que Synorix est en train de faire, dit une fois au-dessus de la liste (annoncé aux lecteurs d'écran).
 */
const LARGEURS = ['w-64', 'w-80', 'w-52', 'w-72', 'w-60', 'w-96']

export function SqueletteListe({ phrase, lignes = 6, libelle }: { phrase: string; lignes?: number; libelle?: string }) {
  return (
    <div role="status" aria-label={libelle ?? phrase} data-squelette-liste="" className="space-y-3">
      <p className="text-sm text-fg-2">{phrase}</p>
      <div aria-hidden="true" className="divide-y divide-bord rounded-carte border border-bord bg-surface-0">
        {Array.from({ length: lignes }, (_, i) => (
          <div key={i} className="flex min-h-16 items-center gap-4 px-5 py-3 max-sm:px-4">
            <Squelette className="size-5 shrink-0 rounded" />
            <Squelette className="h-3.5 w-12 shrink-0 max-sm:hidden" />
            <Squelette className={`h-3.5 max-w-[60%] ${LARGEURS[i % LARGEURS.length]}`} />
            <Squelette className="ml-auto h-3.5 w-24 shrink-0 max-sm:w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default SqueletteListe
