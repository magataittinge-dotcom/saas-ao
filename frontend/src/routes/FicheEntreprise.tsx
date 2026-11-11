// /entreprise/fiche/:rubrique — la fiche « Mon entreprise » à télécharger. Un titre (le retour vers Mon entreprise est le fil
// de la barre du haut, il n'est pas répété ici), les trois fiches en onglets-liens, puis :
//   1. « Aperçu » : le VRAI document, page par page, produit par le serveur (PDF, Word ou Excel) ;
//   2. « Téléchargement » : le format et le bouton « Télécharger la fiche » (la seule action pleine de l'écran), puis le
//      bordereau à personnaliser (titre, sous-titre, contact, logo, couleur) ; à l'ordinateur, la colonne
//      reste collée à droite ;
//   3. « Ce qu'il y a dans la fiche » : à quoi elle sert, ses sections (Prête / À renseigner), le lien vers le bon champ,
//      les lignes libres et les cases de dépôt de la rubrique ; sous l'aperçu.
// Deux colonnes à l'ordinateur (l'aperçu au large, les réglages à côté), une au téléphone ; l'ordre du DOM est l'ordre de
// lecture aux deux largeurs : aperçu, bordereau, contenu. Le patron voit son document, l'ajuste, le télécharge.
// Le bordereau s'enregistre tout seul (800 ms après la dernière saisie) ; l'aperçu et le fichier partent tous deux de l'état
// ENREGISTRÉ : ce que l'on voit est exactement ce que l'on télécharge. Données : GET/PUT /entreprise/fiches/{rubrique},
// POST …/logo, …/apercu et …/generer (backend/routers/fiches_entreprise.py).
// Lecture : chargement → erreur (« Réessayer ») → contenu, par le motif du système (une fiche n'est jamais vide).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { messageErreur } from '@/lib/erreurs'
import { toast } from '@/components/common/Toast'
import ApercuPages, { TEXTE_MISE_A_JOUR } from '@/components/fiche/ApercuPages'
import PhraseARenseigner from '@/components/fiche/PhraseARenseigner'
import ZoneBordereau from '@/components/fiche/ZoneBordereau'
import ZoneContenu from '@/components/fiche/ZoneContenu'
import { useApercuFiche } from '@/components/fiche/useApercuFiche'
import MentionEnregistre, { useMention } from '@/components/fiche/MentionEnregistre'
import { useDonneesEntreprise } from '@/components/entreprise/useDonneesEntreprise'
import { aRenseigner } from '@/lib/entreprise/avancement'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { Page, TitreSection } from '@/components/ui/page'
import { Squelette, SqueletteLignes } from '@/components/ui/squelette'
import { cn } from '@/lib/utils'
import { enMiseAJour, type FormatFiche } from '@/lib/apercuFiche'
import {
  LIBELLE_FICHE, RUBRIQUES_FICHE, bordereauModifie, lienFiche, paletteFiche, sousTitreFiche,
  type FicheBordereau, type FicheReponse, type RubriqueFiche,
} from '@/lib/fiche'

const cleFiche = (rubrique: RubriqueFiche) => ['fiche-entreprise', rubrique] as const
export const DELAI_ENREGISTREMENT_MS = 800
export const RAISON_PDF_INDISPONIBLE = 'Indisponible pour le moment : choisissez Word ou Excel.'

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

/** L'attente : la place de l'aperçu (une page A4) et de la colonne des réglages. */
function SqueletteFiche() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Squelette className="aspect-[210/297] w-full rounded-md" />
      <div className="grid content-start gap-4">
        <SqueletteLignes lignes={2} />
        <Squelette className="h-11 rounded-lg" />
        <Squelette className="h-11 rounded-lg" />
        <Squelette className="h-11 rounded-lg" />
      </div>
    </div>
  )
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
  const [format, setFormat] = useState<FormatFiche>('pdf')
  const [pdfIndisponible, setPdfIndisponible] = useState<string | null>(null)
  const [versionLogo, setVersionLogo] = useState(0)
  const mention = useMention()                          // « Enregistré », une seconde après chaque enregistrement réussi
  // Le compte est celui des cartes de Mon entreprise (informations indispensables de la rubrique encore à saisir).
  const donneesEntreprise = useDonneesEntreprise()
  const aSaisir = donneesEntreprise.profilCharge ? aRenseigner(donneesEntreprise, rubrique).length : 0
  const { etat, pages, planifier } = useApercuFiche(rubrique)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: cleFiche(rubrique),
    queryFn: async () => (await api.get<FicheReponse>(`/entreprise/fiches/${rubrique}`)).data,
  })

  const dernierEnvoye = useRef<string>('')
  const enregistrement = useMutation({
    mutationFn: async (b: FicheBordereau) => (await api.put<FicheReponse>(`/entreprise/fiches/${rubrique}`, corpsEnregistre(b))).data,
    onSuccess: (reponse) => { client.setQueryData(cleFiche(rubrique), reponse); mention.montrer() },
    onError: () => { dernierEnvoye.current = ''; mention.masquer() },
  })

  const logo = useMutation({
    mutationFn: async (fichier: File) => {
      const form = new FormData()
      form.append('file', fichier)
      return (await api.post<{ logo_url: string | null; logo_origine: FicheBordereau['logo_origine'] }>(
        `/entreprise/fiches/${rubrique}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
    },
    onSuccess: (r) => majLogo(r.logo_url, r.logo_origine),
    onError: async (e) => toast(await messageErreur(e, "Le logo n’a pas pu être envoyé. Réessayez avec une image PNG ou JPEG de 2 Mo au plus."), 'error'),
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
    onError: async (e) => toast(await messageErreur(e, "La fiche n’a pas pu être préparée pour le moment. Réessayez dans un instant."), 'error'),
  })

  const bordereau = brouillon ?? data?.bordereau
  const enRetard = aEnregistrer || enregistrement.isPending
  const statut = enRetard || enMiseAJour(etat)
    ? (enregistrement.isPending || aEnregistrer ? 'Enregistrement…' : TEXTE_MISE_A_JOUR)
    : ''

  return (
    <Page
      titre={LIBELLE_FICHE}
      sousTitre={sousTitreFiche(!!data && etat.phase === 'pret')}
    >
      <nav aria-label="Fiches" className="mb-8 flex flex-wrap gap-1">
        {RUBRIQUES_FICHE.map((r) => (
          <Link
            key={r.id} to={lienFiche(r.id)} aria-current={r.id === rubrique ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-lg border px-4 text-sm transition-colors duration-fast ease-survol',
              r.id === rubrique ? 'border-bord bg-surface-0 font-semibold text-fg' : 'border-transparent font-medium text-fg-2 hover:bg-surface-1 hover:text-fg',
            )}
          >
            {r.court}
          </Link>
        ))}
      </nav>

      <EtatRequete
        requete={{ data, isLoading, isError, refetch, isFetching }}
        squelette={<SqueletteFiche />}
        erreur={(
          <EtatErreur
            titre="La fiche n’a pas pu se charger"
            detail="La connexion au serveur a échoué. Vos informations et vos réglages sont toujours enregistrés."
            onReessayer={() => { void refetch() }}
            enCours={isFetching}
          />
        )}
        vide={null}
      >
        {(fiche) => {
          const courant = bordereau ?? fiche.bordereau
          const modifier = (patch: Partial<FicheBordereau>) => setBrouillon({ ...courant, ...patch })
          return (
            <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" data-zones="">
              <section aria-labelledby="zone-apercu" data-zone="apercu" className="min-w-0">
                <TitreSection id="zone-apercu" action={<p className="text-sm text-fg-2" aria-live="polite" data-statut-apercu="">{statut}</p>}>Aperçu</TitreSection>
                <div className="grid gap-3">
                  <PhraseARenseigner n={aSaisir} rubrique={rubrique} />
                  <ApercuPages
                    etat={etat} pages={pages} enRetard={enRetard} donnees={fiche.donnees} bordereau={courant}
                    palette={paletteFiche(courant.couleur)} logoSrc={urlServeur(fiche.bordereau.logo_url)}
                  />
                </div>
              </section>

              <div className="grid min-w-0 gap-3 lg:sticky lg:top-4 lg:row-span-2 lg:-m-3 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto lg:p-3" data-colonne-bordereau="">
                <ZoneBordereau
                  bordereau={courant} onChange={modifier} logoSrc={urlServeur(fiche.bordereau.logo_url)} logoEnCours={logo.isPending}
                  onLogo={(f) => logo.mutate(f)} onRetirerLogo={() => retraitLogo.mutate()}
                  format={format} onFormat={setFormat} pdfIndisponible={pdfIndisponible}
                  onTelecharger={() => telechargement.mutate()} enTelechargement={telechargement.isPending}
                />
                <MentionEnregistre visible={mention.visible} />
                {enregistrement.isError && (
                  <Message ton="erreur">Vos réglages n’ont pas pu être enregistrés. Vérifiez la couleur et la longueur des textes, puis modifiez un champ pour réessayer.</Message>
                )}
              </div>

              <ZoneContenu rubrique={rubrique} donnees={fiche.donnees} libres={courant.lignes_libres} onLibres={(lignes_libres) => modifier({ lignes_libres })} />
            </div>
          )
        }}
      </EtatRequete>
    </Page>
  )
}
