// /entreprise/fiche/:rubrique — la fiche « Mon entreprise » à télécharger (PDF ou Word) : aperçu fidèle de ce que le
// serveur produit, bordereau modifiable sur place (logo, titre, sous-titre, contact, couleur, lignes libres),
// choix du format. Données : GET/PUT /entreprise/fiches/{rubrique}, POST …/logo et …/generer (services/fiches_entreprise.py).
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Pencil, Save } from 'lucide-react'
import { api } from '@/services/api'
import { messageErreur } from '@/lib/erreurs'
import { toast } from '@/components/common/Toast'
import FichePreview from '@/components/fiche/FichePreview'
import EcranEnChargement from '@/components/common/EcranEnChargement'
import { Button } from '@/components/ui/button'
import {
  RUBRIQUES_FICHE, bordereauModifie, lienFiche, paletteFiche,
  type FicheBordereau, type FicheReponse, type RubriqueFiche,
} from '@/lib/fiche'

type Format = 'pdf' | 'docx'
const FORMATS: { id: Format; libelle: string }[] = [
  { id: 'pdf', libelle: 'PDF' },
  { id: 'docx', libelle: 'Word' },
]

const cleFiche = (rubrique: RubriqueFiche) => ['fiche-entreprise', rubrique] as const

/** Adresse d'un fichier signé : « /api/files/view/… » est relative au serveur, comme baseURL (sans « /api »). */
const urlServeur = (chemin: string | null | undefined): string | null =>
  chemin ? `${(api.defaults.baseURL ?? '').replace(/\/api$/, '')}${chemin}` : null

function nomDeFichier(entete: string | undefined, defaut: string): string {
  const utf8 = entete?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) { try { return decodeURIComponent(utf8) } catch { /* repli ci-dessous */ } }
  return entete?.match(/filename="([^"]+)"/i)?.[1] ?? defaut
}

export default function FicheEntreprise() {
  const { rubrique } = useParams()
  const connue = RUBRIQUES_FICHE.find((r) => r.id === rubrique)
  if (!connue) return <Navigate to="/company" replace />
  return <Fiche key={connue.id} rubrique={connue.id} />
}

function Fiche({ rubrique }: { rubrique: RubriqueFiche }) {
  const client = useQueryClient()
  const [brouillon, setBrouillon] = useState<FicheBordereau | null>(null)
  const [edition, setEdition] = useState(false)
  const [format, setFormat] = useState<Format>('pdf')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: cleFiche(rubrique),
    queryFn: async () => (await api.get<FicheReponse>(`/entreprise/fiches/${rubrique}`)).data,
  })

  const enregistrement = useMutation({
    mutationFn: async (b: FicheBordereau) => {
      const corps = {
        titre: b.titre, sous_titre: b.sous_titre, contact: b.contact, couleur: b.couleur,
        lignes_libres: b.lignes_libres.filter((l) => l.libelle.trim()),
      }
      return (await api.put<FicheReponse>(`/entreprise/fiches/${rubrique}`, corps)).data
    },
    onSuccess: (reponse) => { client.setQueryData(cleFiche(rubrique), reponse); setBrouillon(null) },
  })

  const logo = useMutation({
    mutationFn: async (fichier: File) => {
      const form = new FormData()
      form.append('file', fichier)
      return (await api.post<{ logo_url: string | null; logo_origine: FicheBordereau['logo_origine'] }>(
        `/entreprise/fiches/${rubrique}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
    },
    onSuccess: (r) => majLogo(r.logo_url, r.logo_origine),
    onError: async (e) => toast(await messageErreur(e, "Le logo n'a pas pu être envoyé. Réessayez avec une image PNG ou JPEG de 2 Mo au plus."), 'error'),
  })
  const retraitLogo = useMutation({
    mutationFn: async () => (await api.delete<{ logo_url: string | null; logo_origine: FicheBordereau['logo_origine'] }>(
      `/entreprise/fiches/${rubrique}/logo`)).data,
    onSuccess: (r) => majLogo(r.logo_url, r.logo_origine),
  })
  function majLogo(url: string | null, origine: FicheBordereau['logo_origine']) {
    client.setQueryData<FicheReponse>(cleFiche(rubrique), (ancien) =>
      ancien && { ...ancien, bordereau: { ...ancien.bordereau, logo_url: url, logo_origine: origine } })
  }

  const telechargement = useMutation({
    mutationFn: async () => {
      if (brouillon && data && bordereauModifie(brouillon, data.bordereau)) await enregistrement.mutateAsync(brouillon)
      const reponse = await api.post<Blob>(`/entreprise/fiches/${rubrique}/generer`, null, {
        params: { format }, responseType: 'blob', timeout: 120_000,
      })
      const adresse = window.URL.createObjectURL(reponse.data)
      const lien = document.createElement('a')
      lien.href = adresse
      lien.download = nomDeFichier(reponse.headers['content-disposition'], `fiche-${rubrique}.${format}`)
      lien.click()
      window.URL.revokeObjectURL(adresse)
    },
    onError: async (e) => toast(await messageErreur(e, "La fiche n'a pas pu être générée pour le moment. Réessayez dans un instant."), 'error'),
  })

  if (isLoading) return <EcranEnChargement />
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-6" role="alert">
        <p className="text-sm text-fg-2">La fiche n'a pas pu être chargée.</p>
        <Button variant="outline" onClick={() => refetch()}>Réessayer</Button>
      </div>
    )
  }

  const bordereau = brouillon ?? data.bordereau
  const modifie = !!brouillon && bordereauModifie(brouillon, data.bordereau)
  const modifier = (patch: Partial<FicheBordereau>) => setBrouillon({ ...bordereau, ...patch })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/company" className="inline-flex items-center gap-1.5 rounded-xs text-sm font-medium text-fg-2 hover:text-fg [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
        <ArrowLeft size={15} aria-hidden /> Mon entreprise
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-h6 text-fg">Fiche à télécharger — {data.libelle}</h1>
        <p className="text-sm text-fg-2">
          Aperçu de ce que vous remettrez à un acheteur. Les informations viennent de « Mon entreprise » ; le bordereau
          (logo, titre, contact, couleur, lignes libres) se modifie ici.
        </p>
      </header>

      <nav aria-label="Fiches" className="flex flex-wrap gap-2">
        {RUBRIQUES_FICHE.map((r) => (
          <Link
            key={r.id} to={lienFiche(r.id)} aria-current={r.id === rubrique ? 'page' : undefined}
            className={`rounded-pilule px-3.5 py-1.5 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:inline-flex ${r.id === rubrique ? 'bg-accent-tint text-accent-text' : 'bg-surface-1 text-fg-2 hover:bg-surface-2 hover:text-fg'}`}
          >
            {r.court}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Actions sur la fiche">
        <fieldset className="flex items-center gap-1 rounded-pilule bg-surface-1 p-1">
          <legend className="sr-only">Format du fichier</legend>
          {FORMATS.map((f) => (
            <label
              key={f.id}
              className={`cursor-pointer rounded-pilule px-3.5 py-1 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center ${format === f.id ? 'bg-surface-0 text-fg shadow-card' : 'text-fg-2 hover:text-fg'}`}
            >
              <input type="radio" name="format-fiche" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} className="sr-only" />
              {f.libelle}
            </label>
          ))}
        </fieldset>
        <Button variant="outline" aria-pressed={edition} onClick={() => setEdition((v) => !v)}>
          <Pencil aria-hidden /> {edition ? 'Terminer la modification' : 'Modifier le bordereau'}
        </Button>
        <Button variant="secondary" disabled={!modifie || enregistrement.isPending} onClick={() => brouillon && enregistrement.mutate(brouillon)}>
          <Save aria-hidden /> {enregistrement.isPending ? 'Enregistrement…' : modifie ? 'Enregistrer le bordereau' : 'Bordereau enregistré'}
        </Button>
        <Button variant="signature" className="ml-auto" disabled={telechargement.isPending} onClick={() => telechargement.mutate()}>
          <Download aria-hidden /> {telechargement.isPending ? 'Préparation…' : `Télécharger en ${format === 'pdf' ? 'PDF' : 'Word'}`}
        </Button>
      </div>
      {enregistrement.isError && (
        <p role="alert" className="text-sm text-fg-2">Le bordereau n'a pas pu être enregistré. Vérifiez la couleur (#RRGGBB) et la longueur des textes.</p>
      )}

      <FichePreview
        donnees={data.donnees} bordereau={bordereau} palette={paletteFiche(bordereau.couleur)}
        logoSrc={urlServeur(data.bordereau.logo_url)}
        edition={edition ? {
          onChange: modifier, onLogo: (f) => logo.mutate(f), onRetirerLogo: () => retraitLogo.mutate(), logoEnCours: logo.isPending,
        } : undefined}
      />
    </div>
  )
}
