// « Vos AO en cours » : au plus trois AO, la remise et la prochaine action de chacun. L'AO le plus urgent porte
// le bouton principal. Aucun appel IA : tout se calcule sur les AO que l'écran reçoit déjà.
import { Link } from 'react-router-dom'
import { ArrowRight, FolderX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'
import { avancementAO, echeanceAO, estEnCours, etatEcheance } from '@/lib/echeance'
import type { Project } from '@/types'

/** Ce qu'il reste à faire sur un AO : un verbe, l'étape qui suit. */
export function prochaineEtape(p: Project): string {
  if (p.status === 'analyzed' && p.current_step < 4) return 'Décider : on y va ?'
  switch (avancementAO(p.current_step).etape) {
    case 1: return 'Déposer le DCE'
    case 2: return 'Choisir le lot'
    case 3: return p.processing_status === 'processing' ? 'Analyse en cours' : "Lancer l'analyse"
    case 4: return 'Vérifier le dossier'
    case 5: return 'Rédiger le mémoire'
    default: return 'Exporter le dossier'
  }
}

/** Les AO en cours, la remise la plus proche d'abord (sans date à la fin), trois au plus. */
export function aoDeLaBande(projets: readonly Project[], max = 3): Project[] {
  return projets
    .filter((p) => estEnCours(p.status))
    .map((p) => ({ p, t: etatEcheance(echeanceAO(p)).limite?.getTime() ?? Infinity }))
    .sort((a, b) => a.t - b.t)
    .slice(0, max)
    .map((x) => x.p)
}

export interface PropsBandeAO {
  projets: readonly Project[]
  /** Nombre d'AO en cours au total (le titre le donne quand il dépasse la bande). */
  total: number
  chargement?: boolean
  onSansSuite?: (p: { id: string; name: string }) => void
  onNouveau: () => void
}

export default function BandeAO({ projets, total, chargement, onSansSuite, onNouveau }: PropsBandeAO) {
  const liste = aoDeLaBande(projets)
  return (
    <section aria-labelledby="t-bande" data-bande-ao>
      <div className="flex items-baseline justify-between gap-4 border-b border-bord pb-3">
        <h2 id="t-bande" className="text-lg font-semibold text-fg">
          Vos AO en cours
          {total > 0 && <span className="ml-2 font-normal tabular-nums text-fg-3">{total}</span>}
        </h2>
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-accent-text underline-offset-[3px] transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11">
          Mes AO <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {chargement ? (
        <ul aria-label="Chargement des appels d'offres" className="grid gap-3 pt-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <li key={i} className="h-24 animate-pulse rounded-lg bg-surface-1" />)}
        </ul>
      ) : liste.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <div>
            <p className="text-[15px] font-semibold text-fg">Aucun appel d'offres en cours</p>
            <p className="mt-0.5 max-w-[60ch] text-[15px] text-fg-3">Choisissez un avis ci-dessous, ou déposez le DCE (ZIP ou PDF) : Synorix lit les pièces, repère les lots et prépare l'analyse.</p>
          </div>
          <Button variant="outline" onClick={onNouveau}>Nouvel appel d'offres</Button>
        </div>
      ) : (
        <ul className="grid gap-3 pt-4 md:grid-cols-3">
          {liste.map((p, i) => {
            const e = etatEcheance(echeanceAO(p))
            const aDecider = p.status === 'analyzed' && p.current_step < 4
            return (
              <li key={p.id} className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface-1 p-4" data-ao={p.id}>
                <Link to={`/projects/${p.id}`} className="block min-w-0">
                  <span className="line-clamp-2 text-[15px] font-semibold text-fg hover:text-accent-text">{p.name}</span>
                  {p.maitre_ouvrage && <span className="mt-0.5 block truncate text-sm text-fg-3">{p.maitre_ouvrage}</span>}
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {e.etat === 'sans_date'
                    ? <span className="text-sm text-fg-3">Date à préciser</span>
                    : <DeadlinePill echeance={echeanceAO(p)} />}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                  {i === 0 ? (
                    <Button asChild size="sm" className="[@media(pointer:coarse)]:min-h-11">
                      <Link to={`/projects/${p.id}`}>{prochaineEtape(p)} <ArrowRight aria-hidden /></Link>
                    </Button>
                  ) : (
                    <Link to={`/projects/${p.id}`} className="inline-flex items-center text-sm font-medium text-accent-text underline-offset-[3px] hover:underline [@media(pointer:coarse)]:min-h-11">
                      {prochaineEtape(p)}
                    </Link>
                  )}
                  {aDecider && onSansSuite && (
                    <button
                      onClick={() => onSansSuite({ id: p.id, name: p.name })}
                      title="Classer cet AO « Analysé — sans suite » : décision prise, il quitte le tableau de bord"
                      className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 transition-colors duration-base ease-lien hover:text-fg [@media(pointer:coarse)]:min-h-11"
                    >
                      <FolderX size={13} strokeWidth={1.6} aria-hidden /> Sans suite
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
