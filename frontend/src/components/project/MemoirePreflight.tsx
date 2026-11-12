import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case'
import { Champ, ChampNombre, GroupeChamp, ZoneTexte } from '@/components/ui/champ'

// ── Types (miroir de GET /memoire/preflight) ─────────────────────────────────

interface PreflightProfil {
  nom: string | null
  gerant_nom: string | null
  gerant_titre: string | null
  zone_intervention: string | null
  activites: string | null
  organigramme_description: string | null
  moyens_informatiques: string | null
  vehicules: string | null
  materiel: string | null
  effectif_tranche: string | null
}

interface PreflightReference {
  id: string
  intitule: string
  lot: string | null
  maitre_ouvrage: string | null
  annee: number | null
  montant_ht: number | null
  selected: boolean
}

interface PreflightPayload {
  lot: string | null
  profil: PreflightProfil
  references: PreflightReference[]
  quota: { used: number; limit: number }
  organigramme_available: boolean
  vault_documents: { id: string; file_name: string; category: string }[]
}

export interface GanttPhase {
  nom: string
  duree_semaines: number
}

export interface PreflightSelection {
  profile_overrides: Record<string, string> | null
  reference_ids: string[] | null
  update_profile: boolean
  include_organigramme: boolean
  gantt_phases: GanttPhase[] | null
  annexe_document_ids: string[] | null
}

interface Props {
  projectId: string
  onChange: (selection: PreflightSelection) => void
}

// Champs du profil condensé affichés/éditables au pre-flight.
const PROFILE_FIELDS: { key: keyof PreflightProfil; label: string; multiline?: boolean }[] = [
  { key: 'nom', label: 'Entreprise' },
  { key: 'gerant_nom', label: 'Gérant' },
  { key: 'zone_intervention', label: 'Zone d’intervention' },
  { key: 'organigramme_description', label: 'Équipe / effectifs', multiline: true },
  { key: 'materiel', label: 'Matériel', multiline: true },
  { key: 'vehicules', label: 'Véhicules', multiline: true },
]

/** Une section du repli : un filet au-dessus, pas de carte dans la carte. */
const SECTION = 'space-y-3 border-t border-bord pt-4 first:border-t-0 first:pt-0'
const TITRE = 'text-sm font-semibold text-fg'

function usePreflight(projectId: string) {
  return useQuery<PreflightPayload>({
    queryKey: ['memoire-preflight', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/memoire/preflight`)
      return data
    },
    staleTime: 30_000,
  })
}

/** Durée annoncée de la rédaction : mesurée, environ 3 minutes (169 s sur le dossier de démonstration, recette du 4/11). */
export const DUREE_REDACTION = 'Rédaction : environ 3 minutes'

/** La ligne sous le bouton : où en est le quota, puis la durée. Le coût (1 unité) est dit une fois, dans la carte « Abonnement » (G8). */
export function ligneQuotaMemoire(plan: string, quota: { used: number; limit: number }): string {
  const periode = plan === 'free' ? 'sur votre essai' : 'ce mois'
  return `${Math.min(quota.used, quota.limit)} sur ${quota.limit} mémoires utilisés ${periode} · ${DUREE_REDACTION}`
}

/**
 * Rappel du quota et de la durée, affiché près du bouton « Rédiger le mémoire », même quand le pré-contrôle est
 * replié (même requête, même cache que le pré-contrôle).
 * 1.10 — quota selon l'offre (l'essai gratuit est à vie, pas « ce mois »). G8 (4/11) — plus de phrase de coût ici
 * (elle doublait la carte « 1 unité ») et durée mesurée : environ 3 minutes, pas 15.
 */
export function QuotaMemoire({ projectId }: { projectId: string }) {
  const plan = useAuthStore((st) => st.organization?.plan ?? 'free')
  const { data } = usePreflight(projectId)
  if (!data) return null
  return <p className="text-xs text-fg-3">{ligneQuotaMemoire(plan, data.quota)}</p>
}

/**
 * C9a — pre-flight preview : ce que le mémoire utilisera, éditable AVANT de
 * consommer 1 unité de quota. Les modifications sont locales à ce mémoire
 * par défaut ; la case « Mettre à jour mon profil » les propage.
 */
export default function MemoirePreflight({ projectId, onChange }: Props) {
  const { data } = usePreflight(projectId)

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [checkedRefs, setCheckedRefs] = useState<Set<string> | null>(null)
  const [updateProfile, setUpdateProfile] = useState(false)
  const [includeOrganigramme, setIncludeOrganigramme] = useState(false)
  const [ganttPhases, setGanttPhases] = useState<GanttPhase[]>([])
  const [checkedAnnexes, setCheckedAnnexes] = useState<Set<string>>(new Set())

  // Initialise la sélection de références depuis la pré-sélection serveur.
  useEffect(() => {
    if (data && checkedRefs === null) {
      setCheckedRefs(new Set(data.references.filter(r => r.selected).map(r => r.id)))
    }
  }, [data, checkedRefs])

  // Remonte la sélection courante au parent (payload de génération).
  useEffect(() => {
    const validPhases = ganttPhases.filter(p => p.nom.trim() && p.duree_semaines > 0)
    onChange({
      profile_overrides: Object.keys(overrides).length > 0 ? overrides : null,
      reference_ids: checkedRefs !== null ? Array.from(checkedRefs) : null,
      update_profile: updateProfile,
      include_organigramme: includeOrganigramme,
      gantt_phases: validPhases.length > 0 ? validPhases : null,
      annexe_document_ids: checkedAnnexes.size > 0 ? Array.from(checkedAnnexes) : null,
    })
  }, [overrides, checkedRefs, updateProfile, includeOrganigramme, ganttPhases, checkedAnnexes, onChange])

  if (!data) return null

  const setField = (key: string, value: string, original: string | null) => {
    setOverrides(prev => {
      const next = { ...prev }
      if (value === (original ?? '')) {
        delete next[key]  // revenu à la valeur du profil → plus un override
      } else {
        next[key] = value
      }
      return next
    })
  }

  const toggleRef = (id: string) => {
    setCheckedRefs(prev => {
      const next = new Set(prev ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const basculer = (id: string) => (prev: Set<string>) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  return (
    <div className="space-y-4">
      {/* ── Profil condensé éditable ── */}
      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className={TITRE}>Profil utilisé pour ce mémoire</h3>
          {data.profil.effectif_tranche && <span className="text-xs text-fg-3">{data.profil.effectif_tranche}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILE_FIELDS.map(({ key, label, multiline }) => {
            const original = data.profil[key] ?? ''
            const value = key in overrides ? overrides[key] : original
            return (
              <GroupeChamp key={key} libelle={label} aide={key in overrides ? 'Modifié pour ce mémoire' : undefined} className={multiline ? 'sm:col-span-2' : undefined}>
                {multiline
                  ? <ZoneTexte rows={2} value={value ?? ''} onChange={(e) => setField(key, e.target.value, original)} />
                  : <Champ value={value ?? ''} onChange={(e) => setField(key, e.target.value, original)} />}
              </GroupeChamp>
            )
          })}
        </div>
        <div>
          <CaseACocher coche={updateProfile} onChange={setUpdateProfile}
            libelle="Mettre à jour mon profil avec ces modifications (sinon elles restent locales à ce mémoire)" />
          {/* C8a — l'organigramme se dessine à partir de l'équipe du profil : sans équipe, la case attend */}
          <CaseACocher coche={includeOrganigramme && data.organigramme_available} onChange={setIncludeOrganigramme}
            disabled={!data.organigramme_available} libelle="Inclure un organigramme du chantier dans le mémoire" />
          {!data.organigramme_available && (
            <p className="text-xs text-fg-3">
              L’organigramme se dessine à partir de votre équipe.{' '}
              <Link to="/company" className="font-medium text-fg underline underline-offset-2">Compléter mon équipe</Link>
            </p>
          )}
        </div>
      </section>

      {/* ── Références pré-sélectionnées par pertinence ── */}
      {data.references.length > 0 && (
        <section className={SECTION}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className={TITRE}>Références à citer ({checkedRefs?.size ?? 0} sélectionnées)</h3>
            <span className="text-xs text-fg-3">pré-sélection selon le lot, à ajuster librement</span>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {data.references.map((ref) => (
              <li key={ref.id}>
                <CaseACocher coche={checkedRefs?.has(ref.id) ?? false} onChange={() => toggleRef(ref.id)}
                  libelle={<>
                    <span className="block truncate">{ref.intitule}</span>
                    <span className="block text-xs text-fg-3">{[ref.lot, ref.maitre_ouvrage, ref.annee].filter(Boolean).join(' · ')}</span>
                  </>} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Gantt du phasage (facultatif : phases saisies, jamais inventées) ── */}
      <section className={SECTION}>
        <div>
          <h3 className={TITRE}>Planning prévisionnel (facultatif)</h3>
          <p className="mt-1 text-xs text-fg-3">
            Saisissez vos phases : un planning de Gantt sera inséré dans le mémoire. Sans phase, le mémoire n’en contient pas.
          </p>
        </div>
        {ganttPhases.length > 0 && (
          <ul className="space-y-2">
            {ganttPhases.map((phase, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Champ className="min-w-0 flex-1 basis-48" aria-label={`Nom de la phase ${i + 1}`} placeholder="Nom de la phase"
                  value={phase.nom}
                  onChange={(e) => setGanttPhases(prev => prev.map((p, j) => j === i ? { ...p, nom: e.target.value } : p))} />
                <ChampNombre className="w-32 shrink-0" aria-label={`Durée de la phase ${i + 1}, en semaines`} unite="sem." min={1}
                  valeur={phase.duree_semaines || null}
                  onChange={(n) => setGanttPhases(prev => prev.map((p, j) => j === i ? { ...p, duree_semaines: n == null ? 0 : Math.round(n) } : p))} />
                <Bouton variante="discret" aria-label={`Retirer la phase ${i + 1}`}
                  onClick={() => setGanttPhases(prev => prev.filter((_, j) => j !== i))}>Retirer</Bouton>
              </li>
            ))}
          </ul>
        )}
        <Bouton onClick={() => setGanttPhases(prev => [...prev, { nom: '', duree_semaines: 0 }])}>
          <Plus aria-hidden /> Ajouter une phase
        </Bouton>
      </section>

      {/* ── Annexes du coffre-fort (jointes au dossier téléchargé) ── */}
      {data.vault_documents.length > 0 && (
        <section className={SECTION}>
          <div>
            <h3 className={TITRE}>Annexes du coffre-fort (facultatif)</h3>
            <p className="mt-1 text-xs text-fg-3">Jointes au dossier téléchargé, dans le dossier «&nbsp;Annexes&nbsp;».</p>
          </div>
          <ul className="max-h-40 overflow-y-auto">
            {data.vault_documents.map((doc) => (
              <li key={doc.id}>
                <CaseACocher coche={checkedAnnexes.has(doc.id)} onChange={() => setCheckedAnnexes(basculer(doc.id))}
                  libelle={<span className="block truncate">{doc.file_name}</span>} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
