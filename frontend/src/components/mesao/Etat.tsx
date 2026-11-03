// Les couleurs d'état de Mes AO (COULEURS.md) : une couleur = un sens, toujours un mot et une icône à côté.
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Check, Circle, Clock, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Niveau, EtatPoint } from '@/lib/mesAO'

export type TonEtat = 'bleu' | 'vert' | 'ambre' | 'rouge' | 'turquoise' | 'gris'

/** Texte + fond d'une pastille, par ton (jetons `*-ink` sur `*-soft`). */
export const TON_PASTILLE: Record<TonEtat, string> = {
  bleu: 'bg-bleu-soft text-bleu-ink',
  vert: 'bg-vert-soft text-vert-ink',
  ambre: 'bg-ambre-soft text-ambre-ink',
  rouge: 'bg-rouge-soft text-rouge-ink',
  turquoise: 'bg-turquoise-soft text-turquoise-ink',
  gris: 'bg-gris-soft text-gris-ink',
}

export const TON_TEXTE: Record<TonEtat, string> = {
  bleu: 'text-bleu-ink', vert: 'text-vert-ink', ambre: 'text-ambre-ink', rouge: 'text-rouge-ink', turquoise: 'text-turquoise-ink', gris: 'text-gris-ink',
}

/** Pastille : un mot (children) et une icône. */
export function Pastille({ ton, icone: Icone, children, className }: { ton: TonEtat; icone?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-pilule px-2.5 py-0.5 text-[13px] font-semibold leading-5', TON_PASTILLE[ton], className)}>
      {Icone && <Icone size={13} strokeWidth={2.2} aria-hidden className="shrink-0" />}
      <span className="min-w-0">{children}</span>
    </span>
  )
}

const TON_NIVEAU: Record<Niveau, TonEtat> = { rouge: 'rouge', ambre: 'ambre', neutre: 'gris' }
export const tonDuNiveau = (n: Niveau): TonEtat => TON_NIVEAU[n]

/** La remise : « J−3 » / « Aujourd'hui, 12h00 » / « Date de remise passée », rouge à 3 jours, ambre à 7, avec horloge ou alerte. */
export function PastilleRemise({ libelle, niveau, passee, ariaLibelle }: { libelle: string; niveau: Niveau; passee?: boolean; ariaLibelle?: string }) {
  return (
    <Pastille ton={tonDuNiveau(niveau)} icone={passee ? AlertCircle : Clock}>
      <span aria-hidden={ariaLibelle ? true : undefined}>{libelle}</span>
      {ariaLibelle && <span className="sr-only">{ariaLibelle}</span>}
    </Pastille>
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
          <span aria-hidden className={cn('block h-1.5 rounded-full', e.etat === 'fait' ? 'bg-vert-mark' : e.etat === 'cours' ? 'bg-bleu-mark' : 'bg-gris-mark')} />
          {etiquettes && <span className="sr-only">{e.nom} : étape {libelleEtat[e.etat]}</span>}
          {etiquettes ? (
            <span aria-hidden className={cn('mt-1.5 hidden items-center gap-0.5 text-xs leading-4 sm:flex', e.etat === 'fait' ? 'text-vert-ink' : e.etat === 'cours' ? 'font-semibold text-bleu-ink' : 'text-gris-ink')}>
              {e.etat === 'fait' ? <Check size={11} strokeWidth={2.6} aria-hidden className="shrink-0" /> : e.etat === 'cours' ? <Circle size={9} strokeWidth={3} aria-hidden className="shrink-0" /> : null}
              <span className="min-w-0 truncate">{e.nom}</span>
            </span>
          ) : (
            <span className="sr-only">{e.nom} : étape {libelleEtat[e.etat]}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Jauge de lecture : bleu (en cours), avec le texte à côté. */
export function JaugeLecture({ pct, className }: { pct: number; className?: string }) {
  return (
    <span aria-hidden className={cn('block h-1.5 max-w-[210px] overflow-hidden rounded-full bg-gris-soft', className)}>
      <span className="block h-full rounded-full bg-bleu-mark transition-[width] duration-morph ease-lien motion-reduce:transition-none" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
    </span>
  )
}

export { Loader2 }
