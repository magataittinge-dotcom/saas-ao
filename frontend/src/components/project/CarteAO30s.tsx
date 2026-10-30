import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { construireCarteAO, type ChampsCritiquesCarte, type ConditionsCarte, type FaitCarte, type SourceFait } from '@/lib/carteAO'
import type { ChecklistItem, Project } from '@/types'

/** Présentation seule : les faits déjà calculés, aucune couleur écrite ici (styles/pieces.css). */
export function CarteAO30sVue({
  faits, onOpenSource,
}: {
  faits: FaitCarte[]
  onOpenSource?: (source: SourceFait) => void
}) {
  if (faits.length === 0) return null
  return (
    <section className="carte-ao-30s" aria-labelledby="carte-ao-30s-titre">
      <h2 id="carte-ao-30s-titre" className="carte-ao-30s__titre">L’AO en 30 secondes</h2>
      <dl className="carte-ao-30s__faits">
        {faits.map((f) => (
          <div key={f.id} className={`carte-ao-30s__fait${f.large ? ' carte-ao-30s__fait--large' : ''}`}>
            <dt className="carte-ao-30s__libelle">{f.libelle}</dt>
            <dd className={`carte-ao-30s__valeur${f.action ? ' carte-ao-30s__valeur--action' : ''}`}>
              {f.valeur}
              {f.reste && <span className="carte-ao-30s__reste">{f.reste}</span>}
              {f.source && onOpenSource && (
                <button
                  type="button"
                  className="carte-ao-30s__source"
                  aria-label={`Voir dans le DCE : ${f.libelle}`}
                  onClick={() => onOpenSource(f.source as SourceFait)}
                >
                  Voir dans le DCE
                </button>
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
 * « L'AO en 30 secondes » : en tête de l'analyse, le résumé calculé depuis ce qui est déjà en
 * base (champs critiques, checklist, fiche de décision) — aucun appel IA, aucun avis de prix.
 * Les requêtes partagent les clés des cartes voisines : pas de second appel serveur.
 */
export default function CarteAO30s({
  project, onOpenSource,
}: {
  project: Project
  onOpenSource: (source: SourceFait) => void
}) {
  const prete = project.processing_status !== 'analyzing'
  const { data: critiques } = useQuery<CriticalPayload>({
    queryKey: ['critical-fields', project.id],
    queryFn: async () => (await api.get<CriticalPayload>(`/projects/${project.id}/critical-fields`)).data,
    staleTime: 60_000,
    enabled: prete,
  })
  const { data: pieces } = useQuery<ChecklistItem[]>({
    queryKey: ['checklist', project.id],
    queryFn: async () => (await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)).data,
    enabled: prete,
  })
  const { data: score } = useQuery<ScorePayload>({
    queryKey: ['synorix-score', project.id],
    queryFn: async () => (await api.get<ScorePayload>(`/projects/${project.id}/synorix-score`)).data,
    staleTime: 60_000,
    enabled: prete,
  })

  const faits = useMemo(() => {
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

  return <CarteAO30sVue faits={faits} onOpenSource={onOpenSource} />
}
