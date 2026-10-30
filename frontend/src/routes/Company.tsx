import { useForm, useWatch } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Award, Building, Save, MapPin } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { ProfilMemoireEditor } from './MemoireConfig'
import ProfileFreeTextCard from '@/components/company/ProfileFreeTextCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Building size={24} className="text-accent-text" aria-hidden />
        <div>
          <h1 className="font-display text-h6 text-fg">Mon entreprise</h1>
          <p className="text-sm text-fg-2">
            Votre profil vivant — renseigné une fois, réutilisé par chaque mémoire technique
          </p>
        </div>
      </div>

      {/* Onglets : Identité / Moyens / Certifications (le libellé long passe à la ligne au téléphone) */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex w-full overflow-visible rounded-xl">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="h-auto min-h-9 flex-1 whitespace-normal rounded-lg px-2 py-1.5 text-center leading-tight [@media(pointer:coarse)]:min-h-11">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-6 space-y-6">
          {/* C7 — texte libre → Haiku structure → validation avant écriture */}
          <ProfileFreeTextCard />

          {/* Identité : coordonnées légales de l'org (Sirene) + section entreprise */}
          {tab === 'identite' && <OrganizationIdentityForm />}

          {/* Certifications & références : accès coffre-fort + références */}
          {tab === 'certifs' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/vault" className={LIEN_CARTE}>
                <Archive size={18} className="text-accent-text" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-fg">Certifications & attestations</p>
                  <p className="text-xs text-fg-2">Qualibat, RGE, CACES… dans votre coffre-fort</p>
                </div>
              </Link>
              <Link to="/references" className={LIEN_CARTE}>
                <Award size={18} className="text-accent-text" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-fg">Mes références chantiers</p>
                  <p className="text-xs text-fg-2">Citées dans les mémoires, classées par pertinence</p>
                </div>
              </Link>
            </div>
          )}

          {/* Profil mémoire — sections filtrées par onglet, une seule source de vérité */}
          <ProfilMemoireEditor
            visibleSections={TAB_SECTIONS[tab]}
            showImport={tab === 'certifs'}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Carte-lien : la surface de carte du socle, survol et focus comme une carte interactive.
const LIEN_CARTE = 'flex items-center gap-3 rounded-carte bg-surface-1 p-4 text-fg no-underline transition-[background-color,box-shadow] duration-base ease-lien hover:bg-surface-2 hover:shadow-card'

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
    <Card className="p-6">
      <form onSubmit={handleSubmit((data) => save(data))} className="space-y-5">
        <p className="text-xs text-fg-3">
          Coordonnées légales — pré-remplies depuis le répertoire Sirene à l'inscription.
        </p>
        {fields.map(({ key, label, multiline }) => (
          <div key={key}>
            <label htmlFor={`org-${key}`} className="mb-1 block text-sm font-medium text-fg">{label}</label>
            {multiline ? (
              <Textarea id={`org-${key}`} {...register(key)} rows={4} className="resize-y py-2.5" />
            ) : (
              <Input id={`org-${key}`} {...register(key)} className="py-2.5" />
            )}

            {key === 'address' && GMAPS_KEY && watchedAddress.trim().length > 5 && !mapError && (
              <div className="mt-3 overflow-hidden rounded-lg border border-bord-2">
                <img
                  src={staticMapUrl(watchedAddress)}
                  alt="Aperçu carte"
                  className="h-auto w-full"
                  loading="lazy"
                  onError={() => setMapError(true)}
                />
                <div className="flex items-center gap-1.5 bg-surface-0 px-3 py-2 text-xs text-fg-3">
                  <MapPin size={12} aria-hidden />
                  Aperçu de la carte insérée dans vos mémoires techniques
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isPending}>
            <Save size={16} aria-hidden />
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
