import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { cn } from '@/lib/utils'
import { SEUIL_SECTION_BREVE } from '@/lib/memoireControles'

export interface ControleReferences {
  retrouvees: readonly { id: string; intitule: string }[]
  nonRetrouvees: readonly { id: string; intitule: string }[]
}
export interface SectionBreve { part: string; cle: string; titre: string; mots: number }

/**
 * « Contrôles du texte » (A9 : l'ancien « Compagnon Synorix ») : deux contrôles calculés sur le texte du mémoire, rien
 * d'inventé. Du texte à côté de la feuille, deux blocs séparés par un filet (aucune carte). `repliable` (A14) : sous
 * 1 024 px, le bloc passe sous le document, replié ; son en-tête dit ce qu'il contient.
 */
export default function ControlesTexte({ references, breves, onAller, repliable = false, className }: {
  references: ControleReferences | null
  breves: readonly SectionBreve[]
  onAller: (ancre: string) => void
  repliable?: boolean
  className?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const total = references ? references.retrouvees.length + references.nonRetrouvees.length : 0

  const corps = (
    <>
      <section className="border-t border-bord py-3">
        <h3 className="text-sm font-semibold text-fg">Références chantier</h3>
        {references && total > 0 ? (
          <>
            <p className="mt-1 text-sm text-fg-2">
              <span className="chiffres">{references.retrouvees.length}</span> de vos <span className="chiffres">{total}</span> références retrouvées dans le texte.
            </p>
            {references.nonRetrouvees.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {references.nonRetrouvees.map((r) => (
                  <li key={r.id} className="text-xs text-fg-3">« {r.intitule} » n’y figure pas telle quelle.</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-fg-2">
            Vos références marquées dans Mon entreprise seront cherchées dans le texte.{' '}
            <Link to="/references" className={classesBouton('lien', 'inline min-h-0')}>Marquer une référence</Link>
          </p>
        )}
      </section>
      <section className="border-t border-bord py-3">
        <h3 className="text-sm font-semibold text-fg">Sections brèves</h3>
        {breves.length === 0 ? (
          <p className="mt-1 text-sm text-fg-2">Toutes les sections font au moins {SEUIL_SECTION_BREVE} mots.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-fg-2">
              {breves.length} section{breves.length > 1 ? 's font' : ' fait'} moins de {SEUIL_SECTION_BREVE} mots, à étoffer si besoin :
            </p>
            <ul className="mt-1">
              {breves.map((sb) => (
                <li key={`${sb.part}-${sb.cle}`}>
                  <Bouton variante="lien" onClick={() => onAller(`sec-${sb.cle}`)} className="h-auto min-h-8 whitespace-normal text-left text-xs">
                    {sb.titre} · <span className="chiffres">{sb.mots}</span> mots
                  </Bouton>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )

  if (repliable) {
    return (
      <div data-controles-texte="repliable" className={cn('rounded-lg border border-bord bg-surface-0', className)}>
        <Bouton variante="discret" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="w-full justify-between px-4 font-semibold text-fg">
          Contrôles du texte
          <span className="flex items-center gap-2 text-xs font-normal text-fg-3">
            Références, sections brèves
            <ChevronDown aria-hidden className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouvert && 'rotate-180')} />
          </span>
        </Bouton>
        {ouvert && <div className="px-4">{corps}</div>}
      </div>
    )
  }

  return (
    <aside data-controles-texte="" aria-label="Contrôles du texte" className={cn('sticky top-4 w-60', className)}>
      <h2 className="text-sm font-semibold text-fg">Contrôles du texte</h2>
      <p className="mb-3 mt-1 text-xs text-fg-3">Deux contrôles faits sur le texte de ce mémoire.</p>
      {corps}
    </aside>
  )
}
