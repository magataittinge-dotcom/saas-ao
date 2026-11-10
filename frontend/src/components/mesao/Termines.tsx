import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, ChevronDown, Send, Trophy, X, type LucideIcon } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { TitreSection } from '@/components/ui/page'
import { PastilleEtat } from '@/components/ui/pastille'
import { Tableau, type ColonneTableau } from '@/components/ui/tableau'
import { echeanceAO, momentLimite } from '@/lib/echeance'
import { lectureAO } from '@/lib/etatAO'
import { jourCourt, repartitionTermines } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { CelluleAO, MenuAO, type GestesAO } from './LigneAO'

// L'icône de chaque statut fermé ; le mot et le sens viennent de `lectureAO` (lib/etatAO.ts).
const ICONE: Record<string, LucideIcon> = { soumis: Send, gagné: Trophy, perdu: X, sans_suite: Ban }

const jour = jourCourt

/** « déposé le 28 oct. » (date enregistrée au dépôt), sinon « remise le … », sinon « mis à jour le … ». */
export function dateTerminee(p: Project): string {
  if (p.status === 'soumis' && p.depose_at) return `déposé le ${jour(new Date(p.depose_at))}`
  const limite = momentLimite(echeanceAO(p))
  if (limite) return `remise le ${jour(limite)}`
  return `mis à jour le ${jour(new Date(p.updated_at))}`
}

function colonnesTermines(g: GestesAO): ColonneTableau<Project>[] {
  return [
    { cle: 'ao', titre: 'Appel d’offres', rendu: (p) => <div data-terminee={p.id}><CelluleAO projet={p} detail={false} large /></div>, classe: 'md:w-[48%]' },
    { cle: 'statut', titre: 'Statut', tel: true, rendu: (p) => { const l = lectureAO(p, g.maintenant); return <PastilleEtat sens={l.sens} icone={ICONE[p.status] ?? Ban}>{l.libelle}</PastilleEtat> } },
    { cle: 'date', titre: 'Date', tel: true, rendu: (p) => <span className="chiffres text-sm text-fg-2">{dateTerminee(p)}</span> },
    { cle: 'action', titre: 'Action', tel: true, nombre: true, rendu: (p) => {
      const { action } = lectureAO(p, g.maintenant)
      return (
        <div className="flex min-w-0 items-center justify-end gap-1 max-md:justify-between max-md:pt-1.5">
          {action.statut
            ? <Bouton onClick={() => g.onStatut(p)} className="max-md:flex-1">{action.verbe}</Bouton>
            : <Link to={`/projects/${p.id}`} className={classesBouton('secondaire', 'max-md:flex-1')}>{action.verbe}</Link>}
          <MenuAO projet={p} onStatut={g.onStatut} onSupprimer={g.onSupprimer} />
        </div>
      )
    } },
  ]
}

/** Les AO terminés, repliés par défaut : le décompte par statut reste visible, la liste s'ouvre d'un clic (pages de 50). */
export function Termines({ projets, ouvertParDefaut = false, ...gestes }: { projets: Project[]; ouvertParDefaut?: boolean } & GestesAO) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  if (projets.length === 0) return null
  const parStatut = repartitionTermines(projets)
  return (
    <section aria-labelledby="titre-termines" className="mt-10 max-md:mt-7.5">
      <TitreSection id="titre-termines" action={(
        <Bouton variante="discret" aria-expanded={ouvert} aria-controls="liste-terminees" onClick={() => setOuvert((v) => !v)}>
          {ouvert ? 'Replier' : 'Afficher'}
          <ChevronDown aria-hidden strokeWidth={1.75} className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouvert && 'rotate-180')} />
        </Bouton>
      )}>
        Terminés <span className="chiffres font-normal text-fg-3">{projets.length}</span>
      </TitreSection>
      {ouvert ? (
        <div id="liste-terminees">
          <Tableau libelle="Appels d’offres terminés" colonnes={colonnesTermines(gestes)} lignes={projets} cle={(p) => p.id} vide={null} />
        </div>
      ) : (
        <p className="flex flex-wrap gap-2">
          {parStatut.map(([statut, n]) => {
            const premier = projets.find((p) => p.status === statut)
            if (!premier) return null
            const l = lectureAO(premier, gestes.maintenant)
            return <PastilleEtat key={statut} sens={l.sens} icone={ICONE[statut] ?? Ban}>{l.libelle} {n}</PastilleEtat>
          })}
        </p>
      )}
    </section>
  )
}
