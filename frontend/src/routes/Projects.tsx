import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Search } from 'lucide-react'
import { useProjects } from '@/hooks/useProject'
import { useQuota } from '@/components/layout/QuotaGauge'
import { echeanceAO, estEnCours, etatEcheance } from '@/lib/echeance'
import { aDecider, prochaineAction } from '@/lib/intelligence/action'
import { comparerParRemise, quandCourt, resumeMesAO, STATUTS_TERMINES } from '@/lib/mesAO'
import { api } from '@/services/api'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import { ProjectCardGridSkeleton } from '@/components/skeletons'
import { ALaUne } from '@/components/mesao/ALaUne'
import { EnTeteListe, LigneAO } from '@/components/mesao/LigneAO'
import { Pastille } from '@/components/mesao/Etat'
import { ResumeMesAOCartes, type FiltreMesAO } from '@/components/mesao/ResumeMesAO'
import { Termines } from '@/components/mesao/Termines'
import { VideMesAO } from '@/components/mesao/VideMesAO'
import type { Project } from '@/types'

type Tri = 'remise' | 'activite' | 'nom'

const NOMS_FILTRE: Record<Exclude<FiltreMesAO, 'tous'>, string> = { urgent: 'remise sous 7 jours', decider: 'à décider' }

const sansAccent = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Mes AO : on arrive sur du travail en cours. L'en-tête dit la prochaine remise ; quatre cartes de résumé filtrent la liste ;
 * « À la une » montre l'AO dont la remise est la plus proche ; une ligne par AO en cours avec le verbe de sa prochaine action ;
 * les AO terminés restent repliés. Sans AO : la zone de dépôt, Mon entreprise et les avis de la veille. Tout est déterministe.
 */
export default function Projects() {
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading } = useProjects()
  const { data: quota } = useQuota()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<Tri>('remise')
  const [filtre, setFiltre] = useState<FiltreMesAO>('tous')
  const maintenant = useMemo(() => new Date(), [projects]) // eslint-disable-line react-hooks/exhaustive-deps

  const supprimer = async (id: string) => {
    await api.delete(`/projects/${id}`)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    setDeleteTarget(null)
  }

  const resume = useMemo(() => resumeMesAO(projects, maintenant), [projects, maintenant])
  const uneAO = useMemo(() => prochaineAction(projects, maintenant), [projects, maintenant])

  const { enCours, termines } = useMemo(() => {
    const q = sansAccent(recherche.trim())
    const garde = (p: Project) => !q || [p.name, p.maitre_ouvrage, p.selected_lot_name].some((t) => t && sansAccent(t).includes(q))
    const trier = (a: Project, b: Project) => tri === 'nom'
      ? a.name.localeCompare(b.name, 'fr')
      : tri === 'activite' ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() : comparerParRemise(a, b, maintenant)
    let courants = projects.filter((p) => estEnCours(p.status) && garde(p))
    if (filtre === 'urgent') courants = courants.filter((p) => resume.remise7.ids.includes(p.id))
    if (filtre === 'decider') courants = courants.filter(aDecider)
    return {
      enCours: courants.sort(trier),
      termines: projects.filter((p) => !estEnCours(p.status) && garde(p)).sort((a, b) => STATUTS_TERMINES.indexOf(a.status as never) - STATUTS_TERMINES.indexOf(b.status as never) || comparerParRemise(a, b, maintenant)),
    }
  }, [projects, recherche, tri, filtre, resume, maintenant])

  if (isLoading) return <div className="mx-auto w-full max-w-[1360px]"><ProjectCardGridSkeleton count={6} /></div>
  if (projects.length === 0) return <div className="mx-auto w-full max-w-[1360px]"><VideMesAO /></div>

  // « Prochaine remise » : celle de l'AO à la une, seulement si sa date n'est pas passée.
  const prochaine = uneAO && etatEcheance(echeanceAO(uneAO), maintenant).etat !== 'passee' ? uneAO : null
  const quandProchaine = prochaine ? quandCourt(prochaine) : null

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-7 animate-fade-in">
      {deleteTarget && (
        <DeleteConfirmModal
          title={`Supprimer « ${deleteTarget.name} » ?`}
          onConfirm={() => supprimer(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <h1 className="font-display text-h5 text-fg">Mes appels d’offres</h1>
          <p className="mt-1.5 text-sm text-fg-2">
            <strong className="font-semibold text-fg">{resume.enCours} en cours</strong>
            {prochaine && quandProchaine ? <> · prochaine remise <strong className="font-semibold text-fg">{quandProchaine}</strong>, pour {prochaine.name}.</> : '.'}
          </p>
        </div>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-bord-2 bg-surface-0 px-4 text-sm font-semibold text-fg hover:bg-surface-1 max-sm:w-full max-sm:justify-center">
          <MapPin size={16} aria-hidden className="text-turquoise-ink" />Avis de la veille
        </Link>
      </header>

      <ResumeMesAOCartes resume={resume} filtre={filtre} onFiltre={setFiltre} quota={quota} />

      {uneAO && <ALaUne projet={uneAO} maintenant={maintenant} avecRemise={quandCourt(uneAO) !== null} />}

      <section aria-labelledby="titre-en-cours" className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="titre-en-cours" className="font-display text-h6 text-fg">En cours</h2>
            <Pastille ton="gris">{enCours.length}</Pastille>
            {filtre !== 'tous' && (
              <button type="button" onClick={() => setFiltre('tous')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-bord-2 px-3 text-[13px] font-semibold text-fg hover:bg-surface-1 [@media(pointer:coarse)]:min-h-11">
                Filtre : {NOMS_FILTRE[filtre]}<span aria-hidden>×</span><span className="sr-only">retirer le filtre</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
            <label className="relative block min-w-0 sm:w-[280px] sm:flex-none">
              <span className="sr-only">Rechercher un appel d’offres</span>
              <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
              <input type="search" placeholder="Nom, acheteur, lot…" value={recherche} onChange={(e) => setRecherche(e.target.value)}
                className="glass-input min-h-11 w-full py-2 pl-9 pr-3 text-sm" style={{ borderColor: 'var(--border-field)' }} />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-bord-2 bg-surface-0 px-3 text-[13px] text-fg-2">
              <span>Trier par</span>
              <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} className="bg-transparent py-2 text-sm font-medium text-fg outline-none">
                <option value="remise">Remise la plus proche</option>
                <option value="activite">Dernière activité</option>
                <option value="nom">Nom</option>
              </select>
            </label>
          </div>
        </div>

        {enCours.length > 0 ? (
          <div className="overflow-hidden rounded-[18px] border border-bord-2 bg-surface-0">
            <EnTeteListe />
            {enCours.map((p) => <LigneAO key={p.id} projet={p} maintenant={maintenant} onSupprimer={(id, nom) => setDeleteTarget({ id, name: nom })} />)}
          </div>
        ) : (
          <p className="rounded-carte border border-bord-2 bg-surface-1 px-5 py-4 text-sm text-fg-2">
            {recherche.trim() || filtre !== 'tous' ? 'Aucun appel d’offres ne correspond à votre recherche.' : 'Aucun appel d’offres en cours. Déposez un dossier avec « Nouvel appel d’offres ».'}
          </p>
        )}
      </section>

      <Termines projets={termines} onSupprimer={(id, nom) => setDeleteTarget({ id, name: nom })} ouvertParDefaut={recherche.trim() !== ''} />
    </div>
  )
}
