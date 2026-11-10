// Les marques d'état de Mes AO (COULEURS.md) : une couleur = un sens, toujours un mot et une icône à côté. La pastille est
// celle du système (components/ui/pastille.tsx) ; ici, seulement ce qui est propre à un AO : sa remise, son fil, sa jauge.
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Check, Circle, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { PastilleEtat } from '@/components/ui/pastille'
import { cn } from '@/lib/utils'
import type { Niveau, EtatPoint } from '@/lib/mesAO'

export type TonEtat = 'bleu' | 'vert' | 'ambre' | 'rouge' | 'turquoise' | 'gris'

export const TON_TEXTE: Record<TonEtat, string> = {
  bleu: 'text-bleu-ink', vert: 'text-vert-ink', ambre: 'text-ambre-ink', rouge: 'text-rouge-ink', turquoise: 'text-turquoise-ink', gris: 'text-gris-ink',
}

/** Pastille : un mot (children) et une icône. C'est la pastille du système ; sans icône donnée, aucune icône. */
export function Pastille({ ton, icone, children, className }: { ton: TonEtat; icone?: LucideIcon; children: ReactNode; className?: string }) {
  return <PastilleEtat sens={ton} icone={icone ?? null} className={cn('w-fit max-w-full', className)}>{children}</PastilleEtat>
}

const TON_NIVEAU: Record<Niveau, TonEtat> = { rouge: 'rouge', ambre: 'ambre', neutre: 'gris' }
export const tonDuNiveau = (n: Niveau): TonEtat => TON_NIVEAU[n]

/** La remise : « J−3 » / « Aujourd'hui, 12 h » / « Remise passée » ; rouge à 3 jours, ambre à 7, avec horloge ou alerte. */
export function PastilleRemise({ libelle, niveau, passee, ariaLibelle }: { libelle: string; niveau: Niveau; passee?: boolean; ariaLibelle?: string }) {
  return (
    <PastilleEtat sens={passee ? 'ambre' : tonDuNiveau(niveau)} icone={passee ? AlertCircle : Clock}>
      <span aria-hidden={ariaLibelle ? true : undefined}>{libelle}</span>
      {ariaLibelle && <span className="sr-only">{ariaLibelle}</span>}
    </PastilleEtat>
  )
}

/**
 * Le fil à 7 points d'un AO : fait = vert, en cours = bleu, à venir = gris. Le point seul ne dit rien : le nom de l'étape et son
 * état sont écrits à côté (ou lus : `sr-only`). `etiquettes` écrit les 7 noms sous les points (carte « À la une »).
 */
export function FilPoints({ fil, etiquettes, className }: { fil: { nom: string; etat: EtatPoint }[]; etiquettes?: boolean; className?: string }) {
  const courant = fil.find((e) => e.etat === 'cours')
  const libelleEtat: Record<EtatPoint, string> = { fait: 'faite', cours: 'en cours', avenir: 'à venir' }
  return (
    <ol className={cn('grid grid-cols-7 gap-[3px]', etiquettes && 'gap-1.5', className)} aria-label={courant ? `Avancement : étape ${fil.indexOf(courant) + 1} sur ${fil.length}, ${courant.nom}` : 'Avancement'}>
      {fil.map((e) => (
        <li key={e.nom} className="min-w-0">
          <span aria-hidden className={cn('block h-1.5 rounded-pilule', e.etat === 'fait' ? 'bg-vert-mark' : e.etat === 'cours' ? 'bg-bleu-mark' : 'bg-gris-mark')} />
          <span className="sr-only">{e.nom} : étape {libelleEtat[e.etat]}</span>
          {etiquettes && (
            <span aria-hidden className={cn('mt-1.5 hidden items-center gap-0.5 text-xs leading-4 sm:flex', e.etat === 'fait' ? 'text-vert-ink' : e.etat === 'cours' ? 'font-semibold text-bleu-ink' : 'text-gris-ink')}>
              {e.etat === 'fait' ? <Check size={11} strokeWidth={2.6} aria-hidden className="shrink-0" /> : e.etat === 'cours' ? <Circle size={9} strokeWidth={3} aria-hidden className="shrink-0" /> : null}
              <span className="min-w-0 truncate">{e.nom}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Jauge de lecture : bleu (en cours), avec le texte à côté. La largeur est une valeur calculée : la seule mise en forme en ligne. */
export function JaugeLecture({ pct, className }: { pct: number; className?: string }) {
  return (
    <span aria-hidden className={cn('block h-1.5 max-w-[210px] overflow-hidden rounded-pilule bg-gris-soft', className)}>
      <span className="block h-full rounded-pilule bg-bleu-mark transition-[width] duration-pop ease-survol motion-reduce:transition-none" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
    </span>
  )
}
