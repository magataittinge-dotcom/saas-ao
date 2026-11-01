import { useId } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMedia } from '@/hooks/useMedia'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RUBRIQUES, avancement, libelleAvancement, type DonneesEntreprise, type RubriqueId } from '@/lib/entreprise/avancement'

/** Réglette des colonnes : la rubrique choisie prend plus de place, les deux autres se resserrent mais restent lisibles. */
export const COLONNES = { choisie: '2.3fr', autre: '0.85fr' } as const

/** `grid-template-columns` quand `choisie` est ouverte. Fonction pure : testée sans navigateur. */
export function gabaritColonnes(choisie: RubriqueId): string {
  return RUBRIQUES.map((r) => (r.id === choisie ? COLONNES.choisie : COLONNES.autre)).join(' ')
}

export const lienFiche = (id: RubriqueId): string => `/entreprise/fiche/${id}`

const LIEN_FICHE = 'relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-pilule border border-bord-2 px-3 text-sm font-medium text-fg transition-colors duration-base ease-lien hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11'

function Barre({ rempli, total }: { rempli: number; total: number }) {
  return (
    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pilule bg-surface-2">
      <div className="h-full rounded-pilule bg-accent-ui transition-[width] duration-morph ease-lien motion-reduce:transition-none" style={{ width: `${total ? Math.round((rempli / total) * 100) : 0}%` }} />
    </div>
  )
}

function Fiche({ id, titre }: { id: RubriqueId; titre: string }) {
  return (
    <Link to={lienFiche(id)} className={LIEN_FICHE} aria-label={`Fiche : ${titre}`}>
      Fiche <ArrowRight size={14} aria-hidden />
    </Link>
  )
}

/**
 * Les trois rubriques. Ordinateur : trois colonnes dont la choisie s'élargit (grid-template-columns animé).
 * Téléphone et tablette : onglets. Un seul formulaire est monté à la fois, dans la rubrique choisie.
 */
export default function RubriquesEntreprise({ donnees, rubrique, onChoisir, panneaux }: {
  donnees: DonneesEntreprise
  rubrique: RubriqueId
  onChoisir: (id: RubriqueId) => void
  panneaux: Record<RubriqueId, ReactNode>
}) {
  const colonnes = useMedia('(min-width: 1024px)')
  const base = useId()

  if (!colonnes) {
    return (
      <Tabs value={rubrique} onValueChange={(v) => onChoisir(v as RubriqueId)}>
        <TabsList className="flex w-full overflow-visible rounded-xl">
          {RUBRIQUES.map((r) => (
            <TabsTrigger key={r.id} value={r.id} className="h-auto min-h-9 flex-1 whitespace-normal rounded-lg px-2 py-1.5 text-center leading-tight [@media(pointer:coarse)]:min-h-11">
              {r.titre}
            </TabsTrigger>
          ))}
        </TabsList>
        {RUBRIQUES.map((r) => (
          <TabsContent key={r.id} value={r.id} className="mt-4 space-y-4 rounded-carte bg-surface-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-fg-2">{libelleAvancement(avancement(donnees, r.id))}</p>
              <Fiche id={r.id} titre={r.titre} />
            </div>
            {rubrique === r.id && panneaux[r.id]}
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  return (
    <div
      className="grid items-start gap-4 motion-safe:transition-[grid-template-columns] motion-safe:duration-morph motion-safe:ease-lien"
      style={{ gridTemplateColumns: gabaritColonnes(rubrique) }}
    >
      {RUBRIQUES.map((r) => {
        const choisie = rubrique === r.id
        const av = avancement(donnees, r.id)
        const idTitre = `${base}-${r.id}-titre`
        const idPanneau = `${base}-${r.id}-panneau`
        return (
          <section
            key={r.id}
            aria-labelledby={idTitre}
            className={cn('relative min-w-0 rounded-carte bg-surface-1 p-5 transition-shadow duration-base ease-lien', choisie ? 'shadow-card' : 'hover:shadow-card-hover')}
          >
            <div className="flex flex-col gap-3">
              <h2 id={idTitre} className="font-display text-xl font-semibold leading-tight text-fg">
                <button
                  type="button"
                  onClick={() => onChoisir(r.id)}
                  aria-expanded={choisie}
                  aria-controls={idPanneau}
                  className="text-left after:absolute after:inset-0 after:rounded-carte after:content-['']"
                >
                  {r.titre}
                </button>
              </h2>
              <p className="text-sm text-fg-2">{libelleAvancement(av)}</p>
              <Barre {...av} />
              <div><Fiche id={r.id} titre={r.titre} /></div>
            </div>
            {choisie && (
              <div id={idPanneau} className="mt-5 space-y-5 border-t border-bord-2 pt-5 animate-fade-in motion-reduce:animate-none">
                {panneaux[r.id]}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
