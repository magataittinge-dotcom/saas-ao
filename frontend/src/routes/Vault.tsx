import { useState, useCallback } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useDocuments, useDeleteDocument } from '@/hooks/useDocuments'
import { uploadService } from '@/services/upload'
import { FileCard } from '@/components/common/FileCard'
import { ExpiryAlert } from '@/components/common/ExpiryAlert'
import ClassifyDocumentModal from '@/components/vault/ClassifyDocumentModal'
import EchecAction from '@/components/common/EchecAction'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import { Page, TitreSection } from '@/components/ui/page'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'
import { Carte, RangeeCarte } from '@/components/ui/carte'
import { Champ } from '@/components/ui/champ'
import { EtatErreur, EtatRequete, EtatVide } from '@/components/ui/etats'
import { Squelette } from '@/components/ui/squelette'
import { LIGNES_PAR_PAGE, libellePage } from '@/components/ui/tableau'
import { CATEGORY_TYPES, DOC_TYPE_LABELS, VAULT_CATEGORY_LABELS, VAULT_CATEGORY_ORDER } from '@/lib/vault'
import { messageErreur } from '@/lib/erreurs'
import { FORMATS_COFFRE, MESSAGE_REFUS_FORMAT, PRECISION_COFFRE, TAILLE_MAX_COFFRE_MO } from '@/lib/coffreFormats'
import type { Document, VaultCategory } from '@/types'

// Une ligne de pièce (nom, puis statut et actions) passe à la ligne sous 640 px : pas de défilement horizontal à 390 px ;
// ses boutons d'action font 44 px sur écran tactile.
const LISTE_PIECES = 'grid gap-2 [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11 [&>div]:flex-wrap [&>div>div:last-child]:max-w-full [&>div>div:last-child]:flex-wrap sm:[&>div]:flex-nowrap sm:[&>div>div:last-child]:flex-nowrap'

// Le titre d'une section est le premier enfant de sa <section> : l'air au-dessus (40 px, 30 au téléphone) est porté par elle.
const ESPACE_SECTION = 'mt-10 first:mt-0 max-md:mt-[30px]'

/** L'ordre de lecture du coffre-fort : ce qui reste à ranger d'abord, puis les rubriques dans l'ordre d'une candidature. */
const ORDRE: VaultCategory[] = ['unclassified', ...VAULT_CATEGORY_ORDER]
export function piecesDansLOrdre(documents: readonly Document[]): Document[] {
  return ORDRE.flatMap((categorie) => documents.filter((d) => d.category === categorie))
}

/** Ce qu'une rubrique vide attend : les pièces que Synorix y range (les types de la rubrique, sans compteur). */
const exemples = (categorie: VaultCategory) =>
  (categorie === 'unclassified' ? [] : CATEGORY_TYPES[categorie]).filter((t) => t !== 'autre').map((t) => DOC_TYPE_LABELS[t] ?? t).join(', ')

function SqueletteCoffre() {
  return (
    <div className="grid gap-2">
      <Squelette className="mb-2 h-5 w-56" />
      {Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-[52px] rounded-lg" />)}
    </div>
  )
}

/**
 * Coffre-fort : les pièces de l'entreprise, rangées une fois. Une seule action (« Déposer des documents ») ; la zone de
 * dépôt n'apparaît que lorsqu'un fichier survole la page. Une rubrique sans pièce n'est pas un trou : elle rejoint la
 * surface « À déposer », sans compteur. Au-delà de 50 pièces : des pages de 50.
 */
export default function Vault() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Conserve le contexte AO : quand on arrive du parcours (ex. étape Vérification), on offre un retour sans perdre le projet.
  const returnTo = searchParams.get('returnTo')
  const requete = useDocuments()
  const documents = requete.data ?? []
  const { mutateAsync: deleteDocument } = useDeleteDocument()
  // 1.13 — une pièce du coffre-fort ne se supprime pas en un clic
  const [pieceASupprimer, setPieceASupprimer] = useState<Document | null>(null)
  const demanderSuppression = (id: string) => setPieceASupprimer(documents.find((d) => d.id === id) ?? null)
  const [isUploading, setIsUploading] = useState(false)
  // 1.16 — un dépôt qui n'aboutit pas est dit ; les fichiers restants peuvent être renvoyés
  const [echec, setEchec] = useState<{ message: string; fichiers: File[] } | null>(null)
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [page, setPage] = useState(0)

  const expiringDocs = documents.filter((d) => (d.status === 'expired' || d.status === 'expiring_soon') && d.expiry_date)

  const deposer = useCallback(
    async (fichiers: File[]) => {
      if (fichiers.length === 0) return
      setIsUploading(true)
      setEchec(null)
      let restants = [...fichiers]
      try {
        for (const file of fichiers) {
          await uploadService.uploadVaultDocument(file, 'autre')
          restants = restants.filter((f) => f !== file)
        }
      } catch (err) {
        const nom = restants[0]?.name ?? 'ce document'
        setEchec({
          message: await messageErreur(err, `Le dépôt de « ${nom} » au coffre-fort n’a pas abouti.`),
          fichiers: restants,
        })
      } finally {
        queryClient.invalidateQueries({ queryKey: ['documents'] })
        setIsUploading(false)
      }
    },
    [queryClient],
  )

  const onDropRejected = useCallback((refus: FileRejection[]) => {
    const noms = refus.map((r) => `« ${r.file.name} »`).join(', ')
    setEchec({ message: `${noms} : le coffre-fort accepte ${MESSAGE_REFUS_FORMAT}.`, fichiers: [] })
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (acceptes) => { void deposer(acceptes) },
    onDropRejected,
    accept: FORMATS_COFFRE,
    maxSize: TAILLE_MAX_COFFRE_MO * 1024 * 1024,
    noClick: true,
    noKeyboard: true,
  })

  // Le seul geste de l'écran. Vide : il est dans l'état vide ; sinon, à droite du titre.
  const boutonDeposer = (
    <Bouton variante="principal" onClick={open} enCours={isUploading} libelleEnCours="Dépôt en cours…">Déposer des documents</Bouton>
  )
  const vide = requete.data !== undefined && documents.length === 0
  const precision = <p className="mt-3 text-xs text-fg-3">{PRECISION_COFFRE}. Vous pouvez aussi glisser vos fichiers sur cette page.</p>

  const ordonnees = piecesDansLOrdre(documents)
  const pages = Math.max(1, Math.ceil(ordonnees.length / LIGNES_PAR_PAGE))
  const courante = Math.min(page, pages - 1)
  const visibles = ordonnees.slice(courante * LIGNES_PAR_PAGE, (courante + 1) * LIGNES_PAR_PAGE)
  const aDeposer = VAULT_CATEGORY_ORDER.filter((categorie) => !documents.some((d) => d.category === categorie))

  return (
    <div {...getRootProps({ className: 'min-h-[60vh] outline-none' })}>
      <Champ {...getInputProps()} aria-label="Documents à déposer au coffre-fort" />
      <Page
        titre="Coffre-fort"
        sousTitre={vide ? undefined : 'Vos pièces, rangées une fois. Synorix les joint à chaque dossier.'}
        action={vide ? undefined : boutonDeposer}
        avant={returnTo && (
          <Bouton variante="lien" className="mb-4" onClick={() => navigate(returnTo)}>
            <ArrowLeft aria-hidden />Retour à la vérification
          </Bouton>
        )}
      >
        <div className="grid gap-3 pb-6 empty:hidden">
          {isDragActive && (
            <div data-zone-depot="" className="rounded-carte border-2 border-dashed border-accent-ring bg-accent-tint px-6 py-10 text-center">
              <p className="text-lg font-semibold text-fg">Déposez vos documents ici</p>
              <p className="mt-1.5 text-sm text-fg-2">{PRECISION_COFFRE}</p>
            </div>
          )}
          {echec && (
            <EchecAction
              message={echec.message}
              onReessayer={echec.fichiers.length > 0 ? () => { void deposer(echec.fichiers) } : undefined}
              onFermer={() => setEchec(null)}
            />
          )}
          {expiringDocs.map((doc) => (
            <ExpiryAlert key={doc.id} expiryDate={doc.expiry_date!} documentName={doc.file_name} />
          ))}
        </div>

        <EtatRequete
          requete={requete}
          squelette={<SqueletteCoffre />}
          erreur={(
            <EtatErreur
              titre="Le coffre-fort n’a pas pu s’ouvrir"
              detail="La connexion au serveur a échoué. Vos pièces sont toujours là : rien n’a été modifié."
              onReessayer={() => { void requete.refetch() }}
              enCours={requete.isFetching}
            />
          )}
          vide={(
            <>
              {/* A10 ; « avant la fin de leur validité » et non « avant qu'elles expirent » : le vocabulaire des pièces reste positif */}
              <EtatVide
                titre="Vos attestations (URSSAF, assurance, Kbis) vivent ici."
                phrase="Synorix les joint à chaque dossier et vous prévient avant la fin de leur validité."
                action={boutonDeposer}
              />
              {precision}
            </>
          )}
        >
          {() => (
            <>
              {ORDRE.map((categorie) => {
                const pieces = visibles.filter((d) => d.category === categorie)
                if (pieces.length === 0) return null
                const aRanger = categorie === 'unclassified'
                return (
                  <section key={categorie} aria-labelledby={`coffre-${categorie}`} className={ESPACE_SECTION}>
                    <TitreSection id={`coffre-${categorie}`}>{VAULT_CATEGORY_LABELS[categorie]}</TitreSection>
                    {aRanger && <p className="-mt-2 mb-3 text-sm text-fg-2">Rangez ces pièces : Synorix les proposera dans vos candidatures.</p>}
                    <div className={LISTE_PIECES}>
                      {pieces.map((doc) => (
                        <FileCard key={doc.id} document={doc} onDelete={demanderSuppression} onEdit={setEditingDoc} />
                      ))}
                    </div>
                  </section>
                )
              })}

              {pages > 1 && (
                <nav aria-label="Pages du coffre-fort" className="mt-4 flex items-center justify-between gap-3">
                  <p className="chiffres text-sm text-fg-2" aria-live="polite">{libellePage(courante, ordonnees.length)}</p>
                  <div className="flex items-center gap-1">
                    <BoutonIcone libelle="Page précédente" disabled={courante === 0} onClick={() => setPage(courante - 1)}><ChevronLeft aria-hidden strokeWidth={1.5} /></BoutonIcone>
                    <BoutonIcone libelle="Page suivante" disabled={courante >= pages - 1} onClick={() => setPage(courante + 1)}><ChevronRight aria-hidden strokeWidth={1.5} /></BoutonIcone>
                  </div>
                </nav>
              )}

              {aDeposer.length > 0 && (
                <section aria-labelledby="coffre-a-deposer" className={ESPACE_SECTION}>
                  <TitreSection id="coffre-a-deposer">À déposer</TitreSection>
                  <Carte sansMarge className="px-5 sm:px-6">
                    {aDeposer.map((categorie) => (
                      <RangeeCarte key={categorie} className="flex-wrap justify-between gap-x-6 gap-y-0.5 py-3">
                        <p className="text-sm font-medium text-fg max-sm:basis-full">{VAULT_CATEGORY_LABELS[categorie]}</p>
                        <p className="text-sm text-fg-2">{exemples(categorie) || 'Toute autre pièce utile à vos dossiers'}</p>
                      </RangeeCarte>
                    ))}
                  </Carte>
                </section>
              )}
              {precision}
            </>
          )}
        </EtatRequete>
      </Page>

      {pieceASupprimer && (
        <DeleteConfirmModal
          title={`Supprimer « ${pieceASupprimer.file_name} » du coffre-fort ?`}
          detail="La pièce ne sera plus proposée pour vos candidatures."
          onConfirm={async () => { await deleteDocument(pieceASupprimer.id); setPieceASupprimer(null) }}
          onCancel={() => setPieceASupprimer(null)}
        />
      )}
      {editingDoc && <ClassifyDocumentModal document={editingDoc} onClose={() => setEditingDoc(null)} />}
    </div>
  )
}
