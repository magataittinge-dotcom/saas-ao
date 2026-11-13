import { Squelette } from '@/components/ui/squelette'

/**
 * Le squelette d'une LISTE d'étape (Lots, Pièces, fichiers du dépôt), à la forme de ce qui arrive : un titre de section, puis
 * UNE surface au trait et des lignes séparées par un filet. Aucune valeur n'y est écrite : ni « 0 pièce », ni « Prêt » (jury,
 * tour 1 : l'écran chargé s'affichait avec des zéros). Fixe : rien ne pulse.
 * `phrase` : ce que Synorix est en train de faire, dit une fois au-dessus de la liste (annoncé aux lecteurs d'écran).
 * Deux formes (jury, tour 3 : Pièces reprenait le squelette des Lots, case et numéro compris) :
 *  • par défaut, les lots : une case, « Lot 0x », l'intitulé et ses métiers sur deux lignes, les trois faits de droite, le menu ;
 *  • `parFamilles`, les pièces : des familles titrées, et par pièce un nom, un état, le bouton de la ligne et son menu.
 */
const LARGEURS = ['w-64', 'w-80', 'w-52', 'w-72', 'w-60', 'w-96']
const FAMILLES = [3, 2, 2]

function LigneLot({ i }: { i: number }) {
  return (
    <div className="flex min-h-20 flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 max-sm:px-4">
      <Squelette className="size-5 shrink-0 rounded" />
      <Squelette className="h-3.5 w-12 shrink-0 max-sm:hidden" />
      <div className="grid min-w-0 flex-1 gap-2.5">
        <Squelette className={`h-4 max-w-full ${LARGEURS[i % LARGEURS.length]}`} />
        <Squelette className="h-3 w-48 max-w-[60%]" />
      </div>
      <div className="flex shrink-0 items-center gap-3 max-sm:basis-full max-sm:pl-9">
        <Squelette className="h-3.5 w-24" />
        <Squelette className="h-3.5 w-8" />
        <Squelette className="h-3.5 w-14" />
        <Squelette className="ml-3 h-1.5 w-5 max-sm:hidden" />
      </div>
    </div>
  )
}

function LignePieceSquelette({ i }: { i: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 max-sm:px-4">
      <div className="grid min-w-0 flex-1 basis-72 gap-2.5">
        <Squelette className={`h-4 max-w-full ${LARGEURS[(i + 2) % LARGEURS.length]}`} />
        {i % 2 === 0 && <Squelette className="h-3 w-56 max-w-[70%]" />}
      </div>
      <div className="flex items-center justify-between gap-3 max-sm:basis-full sm:w-96">
        <Squelette className="h-3.5 w-16" />
        <div className="flex items-center gap-4">
          <Squelette className="h-11 w-24 rounded-lg" />
          <Squelette className="h-1.5 w-5" />
        </div>
      </div>
    </div>
  )
}

export function SqueletteListe({ phrase, lignes = 6, libelle, parFamilles }: { phrase: string; lignes?: number; libelle?: string; parFamilles?: boolean }) {
  return (
    <div role="status" aria-label={libelle ?? phrase} data-squelette-liste={parFamilles ? 'familles' : 'lots'} className="space-y-3">
      <p className="text-sm text-fg-2">{phrase}</p>
      {parFamilles ? (
        <div aria-hidden="true" className="space-y-8 pt-2">
          {FAMILLES.map((n, f) => (
            <div key={f} className="space-y-3">
              <Squelette className="h-5 w-52 max-w-full" />
              <div className="divide-y divide-bord rounded-carte border border-bord bg-surface-0">
                {Array.from({ length: n }, (_, i) => <LignePieceSquelette key={i} i={f + i} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="divide-y divide-bord rounded-carte border border-bord bg-surface-0">
          {Array.from({ length: lignes }, (_, i) => <LigneLot key={i} i={i} />)}
        </div>
      )}
    </div>
  )
}

export default SqueletteListe
