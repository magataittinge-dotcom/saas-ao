import { useForm, useWatch } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Award, Building, Save, MapPin } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { ProfilMemoireEditor } from './MemoireConfig'
import ProfileFreeTextCard from '@/components/company/ProfileFreeTextCard'
import type { Organization } from '@/types'

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function staticMapUrl(address: string): string {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=12&size=600x300&scale=2&maptype=roadmap&markers=color:red|${encodeURIComponent(address)}&key=${GMAPS_KEY}`
}

// B6 — le profil mémoire vivant vit ICI, en onglets (PRD §4 / ARCH §3.7).
// Une seule source de vérité (MemoireConfig + Organization), consommée par
// le pre-flight. Plus d'entrée « Mémoire technique » séparée.
const TABS = [
  { id: 'identite', label: 'Identité' },
  { id: 'moyens', label: 'Moyens humains & matériels' },
  { id: 'certifs', label: 'Certifications & références' },
] as const

type TabId = typeof TABS[number]['id']

const TAB_SECTIONS: Record<TabId, string[]> = {
  identite: ['entreprise'],
  moyens: ['equipe', 'moyens'],
  certifs: ['methodologie', 'fournisseurs'],
}

export default function Company() {
  const [tab, setTab] = useState<TabId>('identite')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building size={24} style={{ color: '#22D3EE' }} />
        <div>
          <h1 className="text-2xl font-bold text-ds-text">Mon entreprise</h1>
          <p className="text-sm text-ds-text-2">
            Votre profil vivant — renseigné une fois, réutilisé par chaque mémoire technique
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 px-3 py-2.5 text-sm font-medium transition-colors"
            style={{
              background: tab === t.id ? 'rgba(34,211,238,0.10)' : '#1A1D21',
              color: tab === t.id ? '#67E8F9' : '#9AA3AE',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* C7 — texte libre → Haiku structure → validation avant écriture */}
      <ProfileFreeTextCard />

      {/* Identité : coordonnées légales de l'org (Sirene) + section entreprise */}
      {tab === 'identite' && <OrganizationIdentityForm />}

      {/* Certifications & références : accès coffre-fort + références */}
      {tab === 'certifs' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Link to="/vault"
            className="glass-card p-4 flex items-center gap-3 hover:border-sky-300 transition-colors no-underline">
            <Archive size={18} style={{ color: '#22D3EE' }} />
            <div>
              <p className="text-sm font-semibold text-ds-text">Certifications & attestations</p>
              <p className="text-xs text-ds-text-2">Qualibat, RGE, CACES… dans votre coffre-fort</p>
            </div>
          </Link>
          <Link to="/references"
            className="glass-card p-4 flex items-center gap-3 hover:border-sky-300 transition-colors no-underline">
            <Award size={18} style={{ color: '#22D3EE' }} />
            <div>
              <p className="text-sm font-semibold text-ds-text">Mes références chantiers</p>
              <p className="text-xs text-ds-text-2">Citées dans les mémoires, classées par pertinence</p>
            </div>
          </Link>
        </div>
      )}

      {/* Profil mémoire — sections filtrées par onglet, une seule source de vérité */}
      <ProfilMemoireEditor
        visibleSections={TAB_SECTIONS[tab]}
        showImport={tab === 'certifs'}
      />
    </div>
  )
}

// ─── Identité légale (Organization — pré-remplie par Sirene) ─────────────────

function OrganizationIdentityForm() {
  const { organization, setOrganization } = useAuthStore()

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (data: Partial<Organization>) => {
      const { data: updated } = await api.patch<Organization>('/organizations/me', data)
      return updated
    },
    onSuccess: (updated) => {
      setOrganization(updated)
    },
  })

  const { register, handleSubmit, control } = useForm<Partial<Organization>>({
    defaultValues: organization ?? {},
  })
  const watchedAddress = useWatch({ control, name: 'address' }) || ''
  const [mapError, setMapError] = useState(false)

  const fields: { key: keyof Organization; label: string; multiline?: boolean }[] = [
    { key: 'name', label: "Nom de l'entreprise" },
    { key: 'siret', label: 'SIRET' },
    { key: 'address', label: 'Adresse' },
    { key: 'presentation', label: 'Présentation', multiline: true },
  ]

  return (
    <form onSubmit={handleSubmit((data) => save(data))} className="glass-card p-6 space-y-5">
      <p className="text-xs text-ds-text-3">
        Coordonnées légales — pré-remplies depuis le répertoire Sirene à l'inscription.
      </p>
      {fields.map(({ key, label, multiline }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-ds-text mb-1">{label}</label>
          {multiline ? (
            <textarea
              {...register(key)}
              rows={4}
              className="glass-input w-full py-2.5 text-sm"
              style={{ resize: 'vertical' }}
            />
          ) : (
            <input {...register(key)} className="glass-input w-full py-2.5 text-sm" />
          )}

          {key === 'address' && GMAPS_KEY && watchedAddress.trim().length > 5 && !mapError && (
            <div className="mt-3 rounded-lg overflow-hidden border border-[#232730]">
              <img
                src={staticMapUrl(watchedAddress)}
                alt="Aperçu carte"
                className="w-full h-auto"
                loading="lazy"
                onError={() => setMapError(true)}
              />
              <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-ds-text-3"
                style={{ background: '#232730' }}>
                <MapPin size={12} />
                Aperçu de la carte insérée dans vos mémoires techniques
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary flex items-center gap-2 py-2 px-5 disabled:opacity-60"
        >
          <Save size={16} />
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
