import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { cn } from '@/lib/utils'
import type { EntreeSommaire } from '@/lib/memoireSections'
import {
  bilanCriteres, libelleSousCritere, parSection, type RattachementCriteres,
} from '@/lib/memoireCriteres'
import type { SourceChamp } from '@/hooks/useSourceChamp'
import { bilanARefaire, etatDe, type EtatsSections } from '@/lib/memoireEtats'

interface Props {
  entrees: EntreeSommaire[]
  activeSection: string
  onNavigate: (id: string) => void
  /** E1 — sous-critères du RC rattachés à chaque partie, et ceux à couvrir (null = pas encore lu). */
  criteres?: RattachementCriteres | null
  /** Source des critères dans le règlement : « Voir dans le dossier » des sous-critères à couvrir. */
  sourceCriteres?: SourceChamp | null
  onOpenSource?: (source: SourceChamp) => void
  /** Sous 1 280 px : le sommaire se replie (fermé par défaut) au-dessus du document au lieu d'être collé à gauche. */
  repliable?: boolean
  /** E3 — parties que le patron a marquées « À refaire ». */
  etats?: EtatsSections
}

const LIEN = 'flex w-full min-w-0 items-start gap-2 rounded-md text-left transition-colors duration-fast ease-survol hover:bg-surface-1 [@media(pointer:coarse)]:min-h-11'

/**
 * Le sommaire du mémoire : parties et sections, sans carte (du texte à côté de la feuille). Chaque section dit dessous, en
 * petit, les sous-critères du règlement qu'elle traite (une ligne de texte, plus une pastille grise par critère) ; la
 * section lue porte un trait d'accent à gauche ; une partie « À refaire » le dit à l'encre ambre.
 */
export default function SommaireMemoire({
  entrees, activeSection, onNavigate, criteres, sourceCriteres, onOpenSource, repliable = false, etats,
}: Props) {
  const [fermees, setFermees] = useState<Set<string>>(new Set())
  const [ouvert, setOuvert] = useState(false)

  const basculer = (id: string) => {
    setFermees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const rattaches = parSection(criteres)
  const aCouvrir = criteres?.a_couvrir ?? []
  const bilan = bilanCriteres(criteres)
  const bilanRefaire = bilanARefaire(etats)
  // « sec-dechets » → clés « partie_b.dechets » : l'identifiant d'une section ne porte que la sous-section
  const cleDe = (parent: EntreeSommaire, enfant: EntreeSommaire) => {
    const part = parent.id.replace('partie-', 'partie_')
    return `${part}.${enfant.id.replace('sec-', '')}`
  }

  const corps = (
    <>
      {bilanRefaire && <p className="memoire-bilan-refaire mb-2 text-xs font-medium text-ambre-ink">{bilanRefaire}</p>}
      {bilan && (
        <section className="mb-3 border-b border-bord px-2 pb-3" aria-label="Critères du règlement à couvrir">
          <p className="text-xs text-fg-2">{bilan}</p>
          {aCouvrir.length > 0 && (
            <ul className="mt-2 space-y-2">
              {aCouvrir.map((c) => (
                <li key={c.nom} className="text-xs">
                  <span className="memoire-a-couvrir font-semibold text-bleu-ink">À couvrir</span>
                  <span className="text-fg-2"> · {libelleSousCritere(c.nom, c.poids)}</span>
                  {sourceCriteres && onOpenSource && (
                    <Bouton variante="lien" onClick={() => onOpenSource(sourceCriteres)} aria-label={`Voir dans le dossier : ${c.nom}`} className="flex text-xs">
                      Voir dans le dossier
                    </Bouton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <nav aria-label="Sommaire du mémoire">
        {entrees.map((section) => {
          const ouverte = !fermees.has(section.id)
          const active = activeSection === section.id
          const aEnfants = section.enfants.length > 0
          return (
            <div key={section.id} className="mt-1 first:mt-0">
              <Bouton
                variante="discret"
                onClick={() => {
                  if (aEnfants) basculer(section.id)
                  onNavigate(section.id)
                  if (repliable && !aEnfants) setOuvert(false)
                }}
                aria-expanded={aEnfants ? ouverte : undefined}
                aria-current={active ? 'location' : undefined}
                className={cn('h-auto min-h-9 w-full justify-between gap-2 whitespace-normal px-2 py-1.5 text-left font-semibold text-fg', LIEN)}
              >
                <span className="min-w-0 break-words">{section.titre}</span>
                {aEnfants && <ChevronDown aria-hidden className={cn('mt-0.5 text-fg-3 transition-transform duration-survol ease-survol motion-reduce:transition-none', !ouverte && '-rotate-90')} />}
              </Bouton>
              {aEnfants && ouverte && (
                <ul className="ml-2 border-l border-bord">
                  {section.enfants.map((enfant, rang) => {
                    const enfantActif = activeSection === enfant.id
                    const traites = rattaches[cleDe(section, enfant)] ?? []
                    // Un critère se dit une fois par suite de sections qui le traitent (jury, tour 3 : le même critère
                    // redit sous chaque entrée doublait la hauteur du sommaire) : il court jusqu'au critère suivant.
                    const precedente = rang > 0 ? rattaches[cleDe(section, section.enfants[rang - 1])] ?? [] : []
                    const redit = traites.length > 0 && traites.map((s) => s.nom).join('|') === precedente.map((s) => s.nom).join('|')
                    const aRefaire = etatDe(etats, section.id.replace('partie-', 'partie_'), enfant.id.replace('sec-', '')) === 'a_refaire'
                    return (
                      <li key={enfant.id}>
                        <Bouton
                          variante="discret"
                          onClick={() => { onNavigate(enfant.id); if (repliable) setOuvert(false) }}
                          aria-current={enfantActif ? 'location' : undefined}
                          className={cn(
                            '-ml-px h-auto min-h-8 w-full flex-col items-stretch justify-start gap-0.5 whitespace-normal rounded-l-none border-l px-3 py-1 text-left text-xs',
                            LIEN, enfantActif ? 'border-accent-ui font-semibold text-fg' : 'border-transparent font-normal text-fg-2',
                          )}
                        >
                          <span className="min-w-0 break-words">{enfant.titre}</span>
                          {aRefaire && <span className="memoire-a-refaire font-semibold text-ambre-ink">À refaire</span>}
                          {!redit && traites.map((s) => (
                            <span key={s.nom} className="memoire-critere font-normal text-fg-3">{libelleSousCritere(s.nom, s.poids)}</span>
                          ))}
                        </Bouton>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>
    </>
  )

  if (repliable) {
    return (
      <div data-sommaire-repliable="" className="rounded-lg border border-bord bg-surface-0">
        <Bouton variante="discret" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="w-full justify-between px-4 font-semibold text-fg">
          Sommaire
          <span className="flex items-center gap-2 text-xs font-normal text-fg-3">
            {aCouvrir.length > 0 && <span>{aCouvrir.length} à couvrir</span>}
            <ChevronDown aria-hidden className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouvert && 'rotate-180')} />
          </span>
        </Bouton>
        {ouvert && <div className="border-t border-bord px-4 py-3">{corps}</div>}
      </div>
    )
  }

  return (
    <div data-sommaire="" className="sticky top-4 max-h-[calc(100dvh-7rem)] w-56 overflow-y-auto pr-1">
      <p className="mb-2 px-2 text-xs font-medium text-fg-3">Sommaire</p>
      {corps}
    </div>
  )
}
