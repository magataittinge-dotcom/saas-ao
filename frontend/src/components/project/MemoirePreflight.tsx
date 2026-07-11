import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, ListChecks } from 'lucide-react'
import { api } from '@/services/api'

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
  quota: { used: number; limit: number | null }
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
  { key: 'zone_intervention', label: "Zone d'intervention" },
  { key: 'organigramme_description', label: 'Équipe / effectifs', multiline: true },
  { key: 'materiel', label: 'Matériel', multiline: true },
  { key: 'vehicules', label: 'Véhicules', multiline: true },
]

const inputClass =
  'w-full rounded-lg border px-2.5 py-1.5 text-sm bg-ds-bg text-[#E7EAEE] focus:outline-none focus:ring-2 focus:ring-sky-200'
const inputStyle = { borderColor: '#232730' }

/**
 * C9a — pre-flight preview : ce que le mémoire utilisera, éditable AVANT de
 * consommer 1 unité de quota. Les modifications sont locales à ce mémoire
 * par défaut ; la case « Mettre à jour mon profil » les propage.
 */
export default function MemoirePreflight({ projectId, onChange }: Props) {
  const { data } = useQuery<PreflightPayload>({
    queryKey: ['memoire-preflight', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/memoire/preflight`)
      return data
    },
    staleTime: 30_000,
  })

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

  const quotaLabel = data.quota.limit === null
    ? 'Consommera 1 mémoire — plan illimité'
    : `Consommera 1 mémoire — ${data.quota.used}/${data.quota.limit} ce mois`

  return (
    <div className="space-y-4">
      {/* ── Profil condensé éditable ── */}
      <div className="rounded-lg p-4" style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={15} style={{ color: '#22D3EE' }} />
          <h3 className="text-sm font-bold" style={{ color: '#E7EAEE' }}>
            Profil utilisé pour ce mémoire
          </h3>
          {data.profil.effectif_tranche && (
            <span className="text-[11px]" style={{ color: '#6B7280' }}>{data.profil.effectif_tranche}</span>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {PROFILE_FIELDS.map(({ key, label, multiline }) => {
            const original = data.profil[key] ?? ''
            const value = key in overrides ? overrides[key] : original
            return (
              <div key={key} className={multiline ? 'sm:col-span-2' : undefined}>
                <label className="block text-xs font-medium mb-1" style={{ color: '#9AA3AE' }}>
                  {label}
                  {key in overrides && (
                    <span className="ml-1.5 text-[10px] font-semibold" style={{ color: '#FBBF24' }}>
                      modifié pour ce mémoire
                    </span>
                  )}
                </label>
                {multiline ? (
                  <textarea rows={2} className={inputClass} style={inputStyle}
                    value={value ?? ''} onChange={(e) => setField(key, e.target.value, original)} />
                ) : (
                  <input className={inputClass} style={inputStyle}
                    value={value ?? ''} onChange={(e) => setField(key, e.target.value, original)} />
                )}
              </div>
            )
          })}
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer" style={{ color: '#9AA3AE' }}>
          <input type="checkbox" checked={updateProfile}
            onChange={(e) => setUpdateProfile(e.target.checked)} />
          Mettre à jour mon profil avec ces modifications (sinon elles restent locales à ce mémoire)
        </label>

        {/* C8a — option organigramme (grisée si l'équipe du profil est vide) */}
        <label
          className={`flex items-center gap-2 mt-2 text-xs ${data.organigramme_available ? 'cursor-pointer' : 'opacity-60'}`}
          style={{ color: '#9AA3AE' }}
        >
          <input type="checkbox"
            disabled={!data.organigramme_available}
            checked={includeOrganigramme && data.organigramme_available}
            onChange={(e) => setIncludeOrganigramme(e.target.checked)} />
          Inclure un organigramme du chantier dans le mémoire
          {!data.organigramme_available && (
            <a href="/company" className="underline" style={{ color: '#22D3EE' }}>
              compléter mon équipe
            </a>
          )}
        </label>
      </div>

      {/* ── Références pré-sélectionnées par pertinence ── */}
      {data.references.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={15} style={{ color: '#22D3EE' }} />
            <h3 className="text-sm font-bold" style={{ color: '#E7EAEE' }}>
              Références à citer ({checkedRefs?.size ?? 0} sélectionnées)
            </h3>
            <span className="text-[11px]" style={{ color: '#6B7280' }}>
              pré-sélection selon le lot — ajustez librement
            </span>
          </div>
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {data.references.map((ref) => (
              <li key={ref.id}>
                <label className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[#232730]">
                  <input type="checkbox" className="mt-0.5"
                    checked={checkedRefs?.has(ref.id) ?? false}
                    onChange={() => toggleRef(ref.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm truncate" style={{ color: '#E7EAEE' }}>{ref.intitule}</span>
                    <span className="block text-[11px]" style={{ color: '#6B7280' }}>
                      {[ref.lot, ref.maitre_ouvrage, ref.annee].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Gantt du phasage (option — phases saisies, jamais inventées) ── */}
      <div className="rounded-lg p-4" style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: '#E7EAEE' }}>
          Planning prévisionnel (option)
        </h3>
        <p className="text-xs mb-3" style={{ color: '#6B7280' }}>
          Saisissez vos phases : un Gantt sera inséré dans le mémoire. Vide = pas de Gantt.
        </p>
        <div className="space-y-2">
          {ganttPhases.map((phase, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputClass} style={inputStyle} placeholder="Nom de la phase"
                value={phase.nom}
                onChange={(e) => setGanttPhases(prev =>
                  prev.map((p, j) => j === i ? { ...p, nom: e.target.value } : p))} />
              <input type="number" min={1} className={`${inputClass} w-24 shrink-0`} style={inputStyle}
                placeholder="sem."
                value={phase.duree_semaines || ''}
                onChange={(e) => setGanttPhases(prev =>
                  prev.map((p, j) => j === i ? { ...p, duree_semaines: parseInt(e.target.value) || 0 } : p))} />
              <button onClick={() => setGanttPhases(prev => prev.filter((_, j) => j !== i))}
                className="text-xs shrink-0" style={{ color: '#6B7280' }}>retirer</button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setGanttPhases(prev => [...prev, { nom: '', duree_semaines: 0 }])}
          className="mt-2 text-xs font-medium" style={{ color: '#22D3EE' }}>
          + Ajouter une phase
        </button>
      </div>

      {/* ── Annexes du coffre-fort (jointes au ZIP d'export) ── */}
      {data.vault_documents.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color: '#E7EAEE' }}>
            Annexes du coffre-fort (option)
          </h3>
          <p className="text-xs mb-2" style={{ color: '#6B7280' }}>
            Jointes au ZIP d'export en section 3_ANNEXES.
          </p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {data.vault_documents.map((doc) => (
              <li key={doc.id}>
                <label className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer" style={{ color: '#E7EAEE' }}>
                  <input type="checkbox"
                    checked={checkedAnnexes.has(doc.id)}
                    onChange={() => setCheckedAnnexes(prev => {
                      const next = new Set(prev)
                      if (next.has(doc.id)) next.delete(doc.id)
                      else next.add(doc.id)
                      return next
                    })} />
                  <span className="truncate">{doc.file_name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Rappel quota — sobre, avant de consommer ── */}
      <p className="text-xs text-right" style={{ color: '#9AA3AE' }}>{quotaLabel}</p>
    </div>
  )
}
