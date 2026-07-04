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
}

export interface PreflightSelection {
  profile_overrides: Record<string, string> | null
  reference_ids: string[] | null
  update_profile: boolean
  include_organigramme: boolean
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
  'w-full rounded-lg border px-2.5 py-1.5 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-sky-200'
const inputStyle = { borderColor: '#E2E8F0' }

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

  // Initialise la sélection de références depuis la pré-sélection serveur.
  useEffect(() => {
    if (data && checkedRefs === null) {
      setCheckedRefs(new Set(data.references.filter(r => r.selected).map(r => r.id)))
    }
  }, [data, checkedRefs])

  // Remonte la sélection courante au parent (payload de génération).
  useEffect(() => {
    onChange({
      profile_overrides: Object.keys(overrides).length > 0 ? overrides : null,
      reference_ids: checkedRefs !== null ? Array.from(checkedRefs) : null,
      update_profile: updateProfile,
      include_organigramme: includeOrganigramme,
    })
  }, [overrides, checkedRefs, updateProfile, includeOrganigramme, onChange])

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
      <div className="rounded-lg p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={15} style={{ color: '#0EA5E9' }} />
          <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>
            Profil utilisé pour ce mémoire
          </h3>
          {data.profil.effectif_tranche && (
            <span className="text-[11px]" style={{ color: '#94A3B8' }}>{data.profil.effectif_tranche}</span>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {PROFILE_FIELDS.map(({ key, label, multiline }) => {
            const original = data.profil[key] ?? ''
            const value = key in overrides ? overrides[key] : original
            return (
              <div key={key} className={multiline ? 'sm:col-span-2' : undefined}>
                <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>
                  {label}
                  {key in overrides && (
                    <span className="ml-1.5 text-[10px] font-semibold" style={{ color: '#B45309' }}>
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
        <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer" style={{ color: '#475569' }}>
          <input type="checkbox" checked={updateProfile}
            onChange={(e) => setUpdateProfile(e.target.checked)} />
          Mettre à jour mon profil avec ces modifications (sinon elles restent locales à ce mémoire)
        </label>

        {/* C8a — option organigramme (grisée si l'équipe du profil est vide) */}
        <label
          className={`flex items-center gap-2 mt-2 text-xs ${data.organigramme_available ? 'cursor-pointer' : 'opacity-60'}`}
          style={{ color: '#475569' }}
        >
          <input type="checkbox"
            disabled={!data.organigramme_available}
            checked={includeOrganigramme && data.organigramme_available}
            onChange={(e) => setIncludeOrganigramme(e.target.checked)} />
          Inclure un organigramme du chantier dans le mémoire
          {!data.organigramme_available && (
            <a href="/memoire-config" className="underline" style={{ color: '#0EA5E9' }}>
              compléter mon équipe
            </a>
          )}
        </label>
      </div>

      {/* ── Références pré-sélectionnées par pertinence ── */}
      {data.references.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={15} style={{ color: '#0EA5E9' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>
              Références à citer ({checkedRefs?.size ?? 0} sélectionnées)
            </h3>
            <span className="text-[11px]" style={{ color: '#94A3B8' }}>
              pré-sélection selon le lot — ajustez librement
            </span>
          </div>
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {data.references.map((ref) => (
              <li key={ref.id}>
                <label className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[#F8FAFC]">
                  <input type="checkbox" className="mt-0.5"
                    checked={checkedRefs?.has(ref.id) ?? false}
                    onChange={() => toggleRef(ref.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm truncate" style={{ color: '#0F172A' }}>{ref.intitule}</span>
                    <span className="block text-[11px]" style={{ color: '#94A3B8' }}>
                      {[ref.lot, ref.maitre_ouvrage, ref.annee].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Rappel quota — sobre, avant de consommer ── */}
      <p className="text-xs text-right" style={{ color: '#64748B' }}>{quotaLabel}</p>
    </div>
  )
}
