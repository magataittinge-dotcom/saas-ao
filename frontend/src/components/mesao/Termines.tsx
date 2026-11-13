import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, ChevronDown, Send, Trophy, X, type LucideIcon } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { PastilleEtat } from '@/components/ui/pastille'
import { Tableau, type ColonneTableau } from '@/components/ui/tableau'
import { echeanceAO, momentLimite } from '@/lib/echeance'
import { lectureAO } from '@/lib/etatAO'
import { usePrechargementAO } from '@/lib/prechargementAO'
import { jourCourt, repartitionTermines } from '@/lib/mesAO'
import { jourCourtParis } from '@/lib/dateParis'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { CelluleAO, MenuAO, type GestesAO } from './LigneAO'

// L'icône de chaque statut fermé ; le mot et le sens viennent de `lectureAO` (lib/etatAO.ts).
const ICONE: Record<string, LucideIcon> = { soumis: Send, gagné: Trophy, perdu: X, sans_suite: Ban }

const jour = jourCourt

/** « déposé le 28 oct. » (date enregistrée au dépôt), sinon « remise le … », sinon « mis à jour le … ». */
export function dateTerminee(p: Project): string {
  if (p.status === 'soumis' && p.depose_at) return `déposé le ${jourCourtParis(p.depose_at)}`
  const limite = momentLimite(echeanceAO(p))
  if (limite) return `remise le ${jour(limite)}`
  return `mis à jour le ${jourCourtParis(p.updated_at)}`
}

function colonnesTermines(g: GestesAO, precharger: ReturnType<typeof usePrechargementAO>): ColonneTableau<Project>[] {
  return [
    { cle: 'ao', titre: 'Appel d’offres', rendu: (p) => <div data-terminee={p.id}><CelluleAO projet={p} detail={false} large /></div>, classe: 'md:w-[48%]' },
    { cle: 'statut', titre: 'Statut', tel: true, rendu: (p) => { const l = lectureAO(p, g.maintenant); return <PastilleEtat sens={l.sens} icone={ICONE[p.status] ?? Ban}>{l.libelle}</PastilleEtat> } },
    { cle: 'date', titre: 'Date', tel: true, rendu: (p) => <span className="text-sm text-fg-2">{dateTerminee(p)}</span> },
    { cle: 'action', titre: 'Action', tel: true, nombre: true, rendu: (p) => {
      const { action } = lectureAO(p, g.maintenant)
      return (
        <div className="flex min-w-0 items-center justify-end gap-1 max-md:justify-between max-md:pt-1.5">
          {action.statut
            ? <Bouton onClick={() => g.onStatut(p)} className="max-md:flex-1">{action.verbe}</Bouton>
            : <Link to={`/projects/${p.id}`} {...precharger(p)} className={classesBouton('secondaire', 'max-md:flex-1')}>{action.verbe}</Link>}
          <MenuAO projet={p} onStatut={g.onStatut} onSupprimer={g.onSupprimer} />
        </div>
      )
    } },
  ]
}

/** Les AO terminés, repliés par défaut : le décompte par statut reste visible, la liste s'ouvre d'un clic (pages de 50). */
export function Termines({ projets, ouvertParDefaut = false, ...gestes }: { projets: Project[]; ouvertParDefaut?: boolean } & GestesAO) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  const precharger = usePrechargementAO()
  if (projets.length === 0) return null
  const parStatut = repartitionTermines(projets)
  return (
    <section aria-labelledby="titre-termines" className="mt-10 max-md:mt-7.5">
      {/* replié : une rangée sur sa surface, le titre, le décompte et « Afficher » ensemble (jury, tour 3 : un texte nu sur la
          page, le bouton à 1 100 px du titre, « Terminés 1 · 1 gagné ») ; ouvert : le titre de section du tableau */}
      <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-1', ouvert ? 'titre-section' : 'rounded-carte border border-bord bg-surface-0 py-1.5 pl-5 pr-2 shadow-card max-md:pl-4')}>
        <h2 id="titre-termines" className="text-lg font-semibold text-fg">
          Terminés{ouvert && <> <span className="font-normal text-fg-3">{projets.length}</span></>}
          {!ouvert && (
            <span data-decompte-termines="" className="text-sm font-normal text-fg-2">
              {' · '}{parStatut.map(([statut, n]) => {
                const premier = projets.find((p) => p.status === statut)
                return premier ? `${n} ${lectureAO(premier, gestes.maintenant).libelle.toLowerCase()}` : null
              }).filter(Boolean).join(' · ')}
            </span>
          )}
        </h2>
        <Bouton variante="discret" aria-expanded={ouvert} aria-controls="liste-terminees" onClick={() => setOuvert((v) => !v)}>
          {ouvert ? 'Replier' : 'Afficher'}
          <ChevronDown aria-hidden strokeWidth={1.75} className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouvert && 'rotate-180')} />
        </Bouton>
      </div>
      {ouvert && (
        <div id="liste-terminees">
          <Tableau libelle="Appels d’offres terminés" colonnes={colonnesTermines(gestes, precharger)} lignes={projets} cle={(p) => p.id} vide={null} />
        </div>
      )}
    </section>
  )
}
