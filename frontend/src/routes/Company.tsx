import { useForm, useWatch } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Building, Save, MapPin } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import type { Organization } from '@/types'

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function staticMapUrl(address: string): string {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=12&size=600x300&scale=2&maptype=roadmap&markers=color:red|${encodeURIComponent(address)}&key=${GMAPS_KEY}`
}

export default function Company() {
  const { organization, setOrganization } = useAuthStore()
  useQueryClient()

  const fields = organization
    ? [
        { key: 'name', label: 'Nom de l\'entreprise', value: organization.name },
        { key: 'siret', label: 'SIRET', value: organization.siret },
        { key: 'address', label: 'Adresse', value: organization.address ?? '' },
        { key: 'presentation', label: 'Présentation', value: organization.presentation ?? '', multiline: true },
        { key: 'historique', label: 'Historique', value: organization.historique ?? '', multiline: true },
        { key: 'activites', label: 'Activités', value: organization.activites ?? '', multiline: true },
        { key: 'moyens_informatiques', label: 'Moyens informatiques', value: organization.moyens_informatiques ?? '', multiline: true },
        { key: 'vehicules', label: 'Véhicules', value: organization.vehicules ?? '', multiline: true },
        { key: 'materiel', label: 'Matériel', value: organization.materiel ?? '', multiline: true },
        { key: 'fournisseurs', label: 'Fournisseurs', value: organization.fournisseurs ?? '', multiline: true },
      ]
    : []

  // Calculate profile completion
  const filledFields = fields.filter((f) => f.value && f.value.trim().length > 0).length
  const completionPct = Math.round((filledFields / fields.length) * 100)

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building size={24} style={{ color: '#0EA5E9' }} />
        <div>
          <h1 className="text-2xl font-bold text-ds-text">Mon Entreprise</h1>
          <p className="text-sm text-ds-text-2">Ces informations seront utilisées dans vos mémoires techniques</p>
        </div>
      </div>

      {/* Completion bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ds-text">Profil complété à {completionPct}%</span>
          <span className="text-xs text-ds-text-3">{filledFields}/{fields.length} champs</span>
        </div>
        <div className="w-full progress-track rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${completionPct}%`, background: 'linear-gradient(90deg, #0EA5E9, #0284C7)' }}
          />
        </div>
        {completionPct < 80 && (
          <p className="text-xs mt-2" style={{ color: '#475569' }}>
            ⚠️ Un profil complet permet à l'IA de générer des mémoires techniques de meilleure qualité
          </p>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit((data) => save(data))} className="glass-card p-6 space-y-5">
        {fields.map(({ key, label, multiline }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-ds-text mb-1">{label}</label>
            {multiline ? (
              <textarea
                {...register(key as keyof Organization)}
                rows={4}
                className="glass-input w-full py-2.5 text-sm"
                style={{ resize: 'vertical' }}
              />
            ) : (
              <input
                {...register(key as keyof Organization)}
                className="glass-input w-full py-2.5 text-sm"
              />
            )}

            {/* Map preview under address field */}
            {key === 'address' && GMAPS_KEY && watchedAddress.trim().length > 5 && !mapError && (
              <div className="mt-3 rounded-lg overflow-hidden border border-[#E2E8F0]">
                <img
                  src={staticMapUrl(watchedAddress)}
                  alt="Aperçu carte"
                  className="w-full h-auto"
                  loading="lazy"
                  onError={() => setMapError(true)}
                />
                <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-ds-text-3"
                  style={{ background: '#F8FAFC' }}>
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
    </div>
  )
}
