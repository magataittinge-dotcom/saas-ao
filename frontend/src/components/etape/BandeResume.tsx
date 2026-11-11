import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BandeCases, CaseResume } from '@/components/ui/case-resume'
import { PastilleEtat, type Sens } from '@/components/ui/pastille'
import { Bouton } from '@/components/ui/bouton'
import type { SourceEtat } from './EtatElement'

export type EtatCarte = 'pret' | 'a-verifier' | 'neutre'

export interface CarteResume {
  libelle: string
  valeur: string
  /** Pastille d'état : « Prêt » ou « À vérifier ». « neutre » (par défaut) : aucune pastille. */
  etat?: EtatCarte
  /** Jauge : `rempli` sur `total`. */
  jauge?: { rempli: number; total: number }
  /** Une désignation (nom de lot, objet du marché) : texte normal sous la valeur, deux lignes au plus ; le texte entier au survol et
   *  au toucher (la ligne se déplie). Pour un libellé long qui ne peut pas être la valeur en grand. */
  designation?: string
  /** Une ligne d'explication, en petit sous la valeur. */
  detail?: string
  /** Le mot quand il n'y a rien à compter : « Aucun » (par défaut) ou « Aucune », accordé à l'étiquette. */
  rien?: 'Aucun' | 'Aucune'
  /** La source de la valeur dans le dossier : « Source : RC · page 4 » et « Voir dans le dossier ». */
  source?: SourceEtat
}

const PASTILLE: Record<Exclude<EtatCarte, 'neutre'>, { sens: Sens; texte: string }> = {
  pret: { sens: 'vert', texte: 'Prêt' },
  'a-verifier': { sens: 'ambre', texte: 'À vérifier' },
}

function Jauge({ libelle, rempli, total }: { libelle: string } & NonNullable<CarteResume['jauge']>) {
  const pct = total > 0 ? Math.min(100, Math.round((rempli / total) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(rempli, total)}
      className="h-1 overflow-hidden rounded-pilule bg-surface-2"
    >
      <div className="h-full rounded-pilule bg-accent-ui transition-[width] duration-pop ease-survol motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Une désignation longue dans une carte : texte normal, coupé à deux lignes par le style seulement (le texte entier reste dans la
 * page pour le lecteur d'écran). Quand la coupure a vraiment lieu (mesurée), la ligne devient
 * un bouton : un appui l'ouvre et la referme (`aria-expanded`), cible de 44 px sur écran tactile.
 */
function DesignationCarte({ texte }: { texte: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [coupe, setCoupe] = useState(false)
  const ligne = useRef<HTMLSpanElement>(null)
  const cliquable = coupe || ouvert
  useEffect(() => {
    const el = ligne.current
    if (!el) return undefined
    const mesurer = () => { if (!ouvert) setCoupe(el.scrollHeight > el.clientHeight + 1) }
    mesurer()
    if (typeof ResizeObserver === 'undefined') return undefined
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [texte, ouvert, cliquable])
  const contenu = <span ref={ligne} className={cn('block break-words', !ouvert && 'line-clamp-2')}>{texte}</span>
  if (!cliquable) return <p className="text-sm text-fg">{contenu}</p>
  return (
    <button
      type="button"
      aria-expanded={ouvert}
      onClick={() => setOuvert((v) => !v)}
      className="block w-full min-w-0 rounded-xs text-left text-sm text-fg [@media(pointer:coarse)]:min-h-11"
    >
      {contenu}
      <span aria-hidden="true" className="mt-0.5 inline-flex items-center gap-1 font-medium text-accent-text">
        {ouvert ? 'Réduire' : 'Voir tout'}
        <ChevronDown size={14} className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouvert && 'rotate-180')} />
      </span>
    </button>
  )
}

function SourceCarte({ source }: { source: SourceEtat }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 border-t border-bord-2 pt-2 text-sm text-fg-2">
      <span>Source : {source.libelle}</span>
      {source.onVoir && (
        <Bouton variante="lien" onClick={source.onVoir}>Voir dans le dossier</Bouton>
      )}
    </p>
  )
}

/** « 14 » → 14 ; « 0 » → 0 ; tout autre texte reste un texte. Une valeur qui commence par « Aucun » ou « Rien » = rien à compter. */
export function valeurDeCase(valeur: string): number | string | null {
  const v = valeur.trim()
  if (/^\d+$/.test(v)) return Number(v)
  if (v === '' || /^(aucun|aucune|rien)\b/i.test(v)) return null
  return v
}

/** Une case qui n'a rien à compter et rien d'autre à montrer (ni jauge, ni désignation, ni source). */
export function caseSansRien(c: CarteResume): boolean {
  const v = valeurDeCase(c.valeur)
  return (v === null || v === 0) && !c.jauge && !c.designation && !c.source
}

/**
 * Le résumé d'une étape (VEILLE-DESIGN P11, défaut 8 du fondateur) : UNE surface découpée par des filets, trois ou quatre cases
 * (une colonne au téléphone). Chaque case est la `CaseResume` du système : l'étiquette en haut, la valeur dessous ; un nombre
 * supérieur à 0 = le gros chiffre seul ; rien à compter = « Aucun » / « Aucune », jamais un gros « 0 » ni l'étiquette redite.
 * Une pastille d'état, une jauge, une désignation, une ligne d'explication et une source, tous facultatifs.
 *
 * Ce qui trahissait le gabarit (jury, tour 1), réglé ici pour toutes les étapes :
 *  - une case sans rien à compter ne porte pas de pastille (« Aucune » + « Prêt » sur un dossier non analysé : une incertitude
 *    affichée comme une certitude) ;
 *  - à partir de deux cases sans rien à compter, la bande se resserre : elles quittent la surface et tiennent en une ligne
 *    de faits dessous (« À joindre : aucune · À renouveler : aucune »), au lieu de cases égales qui disent toutes « Aucun ».
 */
export function BandeResume({ cartes, libelle = 'Résumé de l’étape', className }: { cartes: CarteResume[]; libelle?: string; className?: string }) {
  if (cartes.length === 0) return null
  const sansRien = cartes.filter(caseSansRien)
  const resserree = sansRien.length >= 2
  const montrees = resserree ? cartes.filter((c) => !caseSansRien(c)) : cartes
  const faits = resserree && (
    <p data-cases-sans-rien="" className="text-sm text-fg-2">
      {sansRien.map((c) => `${c.libelle} : ${(c.rien ?? 'Aucun').toLowerCase()}`).join(' · ')}
    </p>
  )
  if (montrees.length === 0) return <div role="group" aria-label={libelle} className={className}>{faits}</div>
  return (
    <>
    <BandeCases libelle={libelle} className={className}>
      {montrees.map((c) => {
        const pastille = c.etat && c.etat !== 'neutre' && valeurDeCase(c.valeur) !== null && valeurDeCase(c.valeur) !== 0 ? PASTILLE[c.etat] : null
        return (
          <CaseResume key={c.libelle} etiquette={c.libelle} valeur={valeurDeCase(c.valeur)} rien={c.rien ?? 'Aucun'} precision={c.detail}
            etat={pastille ? <PastilleEtat sens={pastille.sens}>{pastille.texte}</PastilleEtat> : undefined}>
            {c.designation && <DesignationCarte texte={c.designation} />}
            {c.jauge && <Jauge libelle={c.libelle} {...c.jauge} />}
            {c.source && <SourceCarte source={c.source} />}
          </CaseResume>
        )
      })}
    </BandeCases>
    {faits}
    </>
  )
}

export default BandeResume
