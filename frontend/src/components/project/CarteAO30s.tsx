import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Bouton } from '@/components/ui/bouton'
import { construireCarteAO, heureLisible, type ChampsCritiquesCarte, type ConditionsCarte, type FaitCarte, type SourceFait } from '@/lib/carteAO'
import type { ChecklistItem, Project } from '@/types'

/** Présentation seule : les faits déjà calculés, aucune couleur écrite ici (styles/pieces.css). */
export function CarteAO30sVue({
  faits, onOpenSource, titre = 'L’AO en 30 secondes',
}: {
  faits: FaitCarte[]
  onOpenSource?: (source: SourceFait) => void
  /** `null` : pas de titre visible (l'écran donne déjà un sous-titre de section) ; le bloc garde un nom accessible. */
  titre?: string | null
}) {
  if (faits.length === 0) return null
  return (
    <section className="carte-ao-30s" {...(titre === null ? { 'aria-label': 'Le marché en bref' } : { 'aria-labelledby': 'carte-ao-30s-titre' })}>
      {titre !== null && <h2 id="carte-ao-30s-titre" className="carte-ao-30s__titre">{titre}</h2>}
      <dl className="carte-ao-30s__faits">
        {faits.map((f) => (
          <div key={f.id} className={`carte-ao-30s__fait${f.large ? ' carte-ao-30s__fait--large' : ''}`}>
            <dt className="carte-ao-30s__libelle">{f.libelle}</dt>
            <dd className={`carte-ao-30s__valeur${f.action ? ' carte-ao-30s__valeur--action' : ''}`}>
              {heureLisible(f.valeur)}
              {f.reste && <span className="carte-ao-30s__reste">{f.reste}</span>}
              {f.source && onOpenSource && (
                <Bouton variante="lien" className="carte-ao-30s__source" aria-label={`Voir dans le dossier : ${f.libelle}`} onClick={() => onOpenSource(f.source as SourceFait)}>
                  Voir dans le dossier
                </Bouton>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

interface ScorePayload { composantes: { statut: 'ok' | 'warning' | 'ko' | 'non_evaluable' }[] }
interface CriticalPayload { fields: ChampsCritiquesCarte }

/**
 * Les faits de l'AO (acheteur, objet, lot, remise, visite, pièces, critères, délai, décision), calculés depuis ce qui est déjà
 * en base — champs critiques, checklist, fiche de décision. Aucun appel IA, aucun avis de prix. Les requêtes partagent les clés
 * des cartes voisines : pas de second appel serveur.
 */
function useLecturesFaitsAO(project: Project) {
  const prete = project.processing_status !== 'analyzing'
  const lectureCritiques = useQuery<CriticalPayload>({
    queryKey: ['critical-fields', project.id],
    queryFn: async () => (await api.get<CriticalPayload>(`/projects/${project.id}/critical-fields`)).data,
    staleTime: 60_000,
    enabled: prete,
  })
  const lecturePieces = useQuery<ChecklistItem[]>({
    queryKey: ['checklist', project.id],
    queryFn: async () => (await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)).data,
    enabled: prete,
  })
  const lectureScore = useQuery<ScorePayload>({
    queryKey: ['synorix-score', project.id],
    queryFn: async () => (await api.get<ScorePayload>(`/projects/${project.id}/synorix-score`)).data,
    staleTime: 60_000,
    enabled: prete,
  })
  return { lectureCritiques, lecturePieces, lectureScore }
}

/**
 * Les lectures des faits sont-elles en cours, la première fois ? Une étape qui pose ces faits (Décider : la fiche de décision
 * et « Le marché en bref ») attend leur fin avant de se dessiner : sinon la fiche grandissait de 600 px sous les sections
 * déjà posées (CLS 0,17 au téléphone). Mêmes clés : aucune requête de plus.
 */
export function useFaitsAOEnLecture(project: Project): boolean {
  const { lectureCritiques, lecturePieces, lectureScore } = useLecturesFaitsAO(project)
  return lectureCritiques.isLoading || lecturePieces.isLoading || lectureScore.isLoading
}

export function useFaitsAO(project: Project): FaitCarte[] {
  const { lectureCritiques: { data: critiques }, lecturePieces: { data: pieces }, lectureScore: { data: score } } = useLecturesFaitsAO(project)

  return useMemo(() => {
    const evaluables = (score?.composantes ?? []).filter((c) => c.statut !== 'non_evaluable')
    const conditions: ConditionsCarte | null = evaluables.length
      ? {
        relevees: evaluables.filter((c) => c.statut === 'ok').length,
        aConfirmer: evaluables.filter((c) => c.statut !== 'ok').length,
      }
      : null
    // Seules les pièces dont l'entreprise est responsable (coffre + formulaires), hors « Non concerné »
    const aFournir = (pieces ?? []).filter((p) =>
      ['fournir', 'completer'].includes(p.document_group ?? 'fournir') && p.status !== 'non_applicable')
    return construireCarteAO({ projet: project, champs: critiques?.fields ?? null, pieces: aFournir, conditions })
  }, [project, critiques, pieces, score])
}

/** « L'AO en 30 secondes » : en tête de l'analyse, le résumé calculé depuis ce qui est déjà en base. */
export default function CarteAO30s({
  project, onOpenSource,
}: {
  project: Project
  onOpenSource: (source: SourceFait) => void
}) {
  return <CarteAO30sVue faits={useFaitsAO(project)} onOpenSource={onOpenSource} />
}
