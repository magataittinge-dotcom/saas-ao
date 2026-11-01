// /entreprise/fiche/:rubrique — la fiche « Mon entreprise » à télécharger, en trois zones (ordinateur : côte à côte ; téléphone :
// empilées, l'aperçu d'abord) :
//   1. « Ce qu'il y a dans la fiche » : à quoi elle sert, ses sections (Prête / À renseigner) et le lien vers le bon champ ;
//   2. « Aperçu » : le VRAI document, page par page, produit par le serveur (PDF, Word ou Excel) ;
//   3. « Bordereau et téléchargement » : logo, titre, sous-titre, contact, couleur, lignes libres, format, bouton.
// Le bordereau s'enregistre tout seul (800 ms après la dernière saisie) ; l'aperçu et le fichier partent tous deux de l'état
// ENREGISTRÉ : ce que l'on voit est exactement ce que l'on télécharge. Données : GET/PUT /entreprise/fiches/{rubrique},
// POST …/logo, …/apercu et …/generer (backend/routers/fiches_entreprise.py).
//
// Ordre sur téléphone : aperçu, puis zone 3 (bordereau et bouton), puis zone 1 (contenu). Le patron voit d'abord son document,
// l'ajuste et le télécharge sans défiler ; la liste des sections à compléter, plus rare, vient après. Le DOM suit l'ordre de
// l'ordinateur (contenu, aperçu, bordereau) : la lecture au clavier et à l'écran y est naturelle ; seule la présentation
// du téléphone réordonne (CSS ``order``).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/services/api'
import { messageErreur } from '@/lib/erreurs'
import { toast } from '@/components/common/Toast'
import ApercuPages, { TEXTE_MISE_A_JOUR } from '@/components/fiche/ApercuPages'
import PhraseARenseigner from '@/components/fiche/PhraseARenseigner'
import ZoneBordereau from '@/components/fiche/ZoneBordereau'
import ZoneContenu from '@/components/fiche/ZoneContenu'
import { useApercuFiche } from '@/components/fiche/useApercuFiche'
import { useDonneesEntreprise } from '@/components/entreprise/useDonneesEntreprise'
import { aRenseigner } from '@/lib/entreprise/avancement'
import EcranEnChargement from '@/components/common/EcranEnChargement'
import { Button } from '@/components/ui/button'
import { enMiseAJour, type FormatFiche } from '@/lib/apercuFiche'
import {
  RUBRIQUES_FICHE, bordereauModifie, lienFiche, paletteFiche,
  type FicheBordereau, type FicheReponse, type RubriqueFiche,
} from '@/lib/fiche'

const cleFiche = (rubrique: RubriqueFiche) => ['fiche-entreprise', rubrique] as const
export const DELAI_ENREGISTREMENT_MS = 800
export const RAISON_PDF_INDISPONIBLE = 'Indisponible pour le moment : choisissez Word ou Excel.'

/** Adresse d'un fichier signé : « /api/files/view/… » est relative au serveur, comme baseURL (sans « /api »). */
const urlServeur = (chemin: string | null | undefined): string | null =>
  chemin ? `${(api.defaults.baseURL ?? '').replace(/\/api$/, '')}${chemin}` : null

function nomDeFichier(entete: string | undefined, defaut: string): string {
  const utf8 = entete?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) { try { return decodeURIComponent(utf8) } catch { /* repli ci-dessous */ } }
  return entete?.match(/filename="([^"]+)"/i)?.[1] ?? defaut
}

/** Ce que le serveur enregistre : une ligne libre sans libellé n'est pas envoyée (elle reste à l'écran, en cours de saisie). */
const corpsEnregistre = (b: FicheBordereau) => ({
  titre: b.titre, sous_titre: b.sous_titre, contact: b.contact, couleur: b.couleur,
  lignes_libres: b.lignes_libres.filter((l) => l.libelle.trim()),
})

export default function FicheEntreprise() {
  const { rubrique } = useParams()
  const connue = RUBRIQUES_FICHE.find((r) => r.id === rubrique)
  if (!connue) return <Navigate to="/company" replace />
  return <Fiche key={connue.id} rubrique={connue.id} />
}

function Fiche({ rubrique }: { rubrique: RubriqueFiche }) {
  const client = useQueryClient()
  const [brouillon, setBrouillon] = useState<FicheBordereau | null>(null)
  const [format, setFormat] = useState<FormatFiche>('pdf')
  const [pdfIndisponible, setPdfIndisponible] = useState<string | null>(null)
  const [versionLogo, setVersionLogo] = useState(0)
  const [enregistre, setEnregistre] = useState(false)
  // Le compte est celui des cartes de Mon entreprise (informations indispensables de la rubrique encore à saisir).
  const donneesEntreprise = useDonneesEntreprise()
  const aSaisir = donneesEntreprise.profilCharge ? aRenseigner(donneesEntreprise, rubrique).length : 0
  const { etat, pages, planifier } = useApercuFiche(rubrique)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: cleFiche(rubrique),
    queryFn: async () => (await api.get<FicheReponse>(`/entreprise/fiches/${rubrique}`)).data,
  })

  const dernierEnvoye = useRef<string>('')
  const enregistrement = useMutation({
    mutationFn: async (b: FicheBordereau) => (await api.put<FicheReponse>(`/entreprise/fiches/${rubrique}`, corpsEnregistre(b))).data,
    onSuccess: (reponse) => { client.setQueryData(cleFiche(rubrique), reponse); setEnregistre(true) },
    onError: () => { dernierEnvoye.current = '' },
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
    setVersionLogo((v) => v + 1)                         // le logo a changé : l'aperçu est à refaire
  }

  // ── Enregistrement automatique : 800 ms après la dernière saisie ──
  const aEnregistrer = !!brouillon && !!data && bordereauModifie(
    { ...brouillon, lignes_libres: brouillon.lignes_libres.filter((l) => l.libelle.trim()) }, data.bordereau)
  useEffect(() => {
    if (!brouillon || !aEnregistrer) return
    const cle = JSON.stringify(corpsEnregistre(brouillon))
    if (cle === dernierEnvoye.current) return                        // déjà envoyé tel quel (le serveur a pu le normaliser)
    const minuteur = setTimeout(() => { dernierEnvoye.current = cle; enregistrement.mutate(brouillon) }, DELAI_ENREGISTREMENT_MS)
    return () => clearTimeout(minuteur)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `enregistrement` change à chaque rendu ; seule la saisie relance le délai
  }, [brouillon, aEnregistrer])

  // ── Aperçu : repart quand le format, une donnée, le bordereau enregistré ou le logo change ──
  const signature = useMemo(() => data && JSON.stringify([
    data.donnees, data.bordereau.titre, data.bordereau.sous_titre, data.bordereau.contact, data.bordereau.couleur,
    data.bordereau.lignes_libres, data.bordereau.logo_origine, versionLogo,
  ]), [data, versionLogo])
  const premier = useRef(true)
  useEffect(() => {
    if (!signature) return
    planifier(format, premier.current ? 0 : undefined)             // première demande tout de suite, les suivantes après 800 ms
    premier.current = false
  }, [signature, format, planifier])
  useEffect(() => {                                              // sans rendu exact : le PDF est grisé, Word prend le relais
    if (etat.phase === 'indisponible') {
      setPdfIndisponible(RAISON_PDF_INDISPONIBLE)
      setFormat((f) => (f === 'pdf' ? 'docx' : f))
    }
  }, [etat.phase])

  const telechargement = useMutation({
    mutationFn: async () => {
      if (brouillon && data && aEnregistrer) await enregistrement.mutateAsync(brouillon)   // le fichier part de l'état enregistré
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
  const modifier = (patch: Partial<FicheBordereau>) => { setEnregistre(false); setBrouillon({ ...bordereau, ...patch }) }
  const enRetard = aEnregistrer || enregistrement.isPending
  const statut = enRetard || enMiseAJour(etat)
    ? (enregistrement.isPending || aEnregistrer ? 'Enregistrement…' : TEXTE_MISE_A_JOUR)
    : enregistre ? 'Enregistré' : ''

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <Link to="/company" className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-fg-2 hover:text-fg">
        <ArrowLeft size={15} aria-hidden /> Mon entreprise
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-h6 text-fg">Fiche à télécharger — {data.libelle}</h1>
        <p className="text-sm text-fg-2">
          Ce que vous voyez au centre est exactement ce que vous téléchargez. Les informations viennent de « Mon entreprise ».
        </p>
      </header>

      <nav aria-label="Fiches" className="flex flex-wrap gap-2">
        {RUBRIQUES_FICHE.map((r) => (
          <Link
            key={r.id} to={lienFiche(r.id)} aria-current={r.id === rubrique ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-pilule px-3.5 py-1.5 text-sm font-medium transition-colors ${r.id === rubrique ? 'bg-accent-tint text-accent-text' : 'bg-surface-1 text-fg-2 hover:bg-surface-2 hover:text-fg'}`}
          >
            {r.court}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,15.5rem)_minmax(0,1fr)_minmax(0,19rem)] lg:items-start xl:gap-8" data-trois-zones>
        <div className="order-3 lg:order-none"><ZoneContenu rubrique={rubrique} donnees={data.donnees} libres={bordereau.lignes_libres} apresValidation={() => { void client.invalidateQueries({ queryKey: cleFiche(rubrique) }) }} /></div>

        <section aria-labelledby="zone-apercu" data-zone="apercu" className="order-1 min-w-0 space-y-3 lg:order-none">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="zone-apercu" className="font-display text-h6 text-fg">Aperçu</h2>
            <p className="text-sm text-fg-2" aria-live="polite" data-statut-apercu>{statut}</p>
          </div>
          <PhraseARenseigner n={aSaisir} rubrique={rubrique} />
          <ApercuPages
            etat={etat} pages={pages} enRetard={enRetard} donnees={data.donnees} bordereau={bordereau}
            palette={paletteFiche(bordereau.couleur)} logoSrc={urlServeur(data.bordereau.logo_url)}
          />
        </section>

        <div className="order-2 lg:order-none lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:-m-3 lg:overflow-y-auto lg:p-3">
          <ZoneBordereau
            bordereau={bordereau} onChange={modifier} logoSrc={urlServeur(data.bordereau.logo_url)} logoEnCours={logo.isPending}
            onLogo={(f) => logo.mutate(f)} onRetirerLogo={() => retraitLogo.mutate()}
            sections={data.donnees.sections.map(({ id, titre }) => ({ id, titre }))}
            format={format} onFormat={setFormat} pdfIndisponible={pdfIndisponible}
            onTelecharger={() => telechargement.mutate()} enTelechargement={telechargement.isPending}
          />
          {enregistrement.isError && (
            <p role="alert" className="mt-3 text-sm text-fg-2">Le bordereau n'a pas pu être enregistré. Vérifiez la couleur et la longueur des textes.</p>
          )}
        </div>
      </div>
    </div>
  )
}
