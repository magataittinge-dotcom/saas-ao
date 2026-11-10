import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { api } from '@/services/api'
import { Pleine } from './champs'
import { adresseCartographiable, lireCarteSiege, sourceImage, type ReponseCarteSiege } from '@/lib/carteSiege'

/** Vue de la carte : l'image du Plan IGN et sa légende (adresse, source et date d'extraction, exigées par la Licence Ouverte). */
export function CarteSiegeVue({ carte }: { carte: ReponseCarteSiege }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-bord-2">
      <img src={sourceImage(carte)} alt="Carte de situation du siège de l’entreprise" className="h-auto w-full" />
      <figcaption className="flex items-start gap-1.5 bg-surface-0 px-3 py-2 text-xs text-fg-3">
        <MapPin size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>Aperçu de la carte insérée dans vos mémoires techniques. {carte.legende}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Carte IGN du siège, d'après l'adresse enregistrée. Rien n'est affiché sans adresse, ou si la carte n'a pas pu être
 * composée (le mémoire, lui aussi, s'en passe sans texte d'attente).
 */
export default function CarteSiege({ adresse }: { adresse: unknown }) {
  const enregistree = adresseCartographiable(adresse) ? adresse.trim() : ''
  const requete = useQuery({
    queryKey: ['carte-siege', enregistree],
    queryFn: async () => lireCarteSiege((await api.get('/organizations/me/carte', { timeout: 30_000 })).data),
    enabled: enregistree !== '',
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  if (enregistree === '' || !requete.data) return null
  return <Pleine><CarteSiegeVue carte={requete.data} /></Pleine>
}
