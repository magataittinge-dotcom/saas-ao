import { useState, useCallback } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, Archive, Tag, ArrowLeft } from 'lucide-react'
import { useDocuments, useDeleteDocument } from '@/hooks/useDocuments'
import { uploadService } from '@/services/upload'
import { FileCard } from '@/components/common/FileCard'
import { ExpiryAlert } from '@/components/common/ExpiryAlert'
import ClassifyDocumentModal from '@/components/vault/ClassifyDocumentModal'
import { DocumentListSkeleton } from '@/components/skeletons'
import { useQueryClient } from '@tanstack/react-query'
import { VAULT_CATEGORY_LABELS, VAULT_CATEGORY_ORDER } from '@/lib/vault'
import type { Document } from '@/types'
import EchecAction from '@/components/common/EchecAction'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import { messageErreur } from '@/lib/erreurs'
import { cn } from '@/lib/utils'

// Une ligne de pièce (nom, puis statut et actions) passe à la ligne sous 640 px : pas de défilement horizontal à 390 px ;
// ses boutons d'action font 44 px sur écran tactile.
const LISTE_PIECES = 'space-y-2 [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11 [&>div]:flex-wrap [&>div>div:last-child]:max-w-full [&>div>div:last-child]:flex-wrap sm:[&>div]:flex-nowrap sm:[&>div>div:last-child]:flex-nowrap'

export default function Vault() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Conserve le contexte AO : quand on arrive du parcours (ex. étape
  // Vérification), on offre un retour explicite sans perdre le projet.
  const returnTo = searchParams.get('returnTo')
  const { data: documents = [], isLoading } = useDocuments()
  const { mutateAsync: deleteDocument } = useDeleteDocument()
  // 1.13 — une pièce du coffre-fort ne se supprime pas en un clic
  const [pieceASupprimer, setPieceASupprimer] = useState<Document | null>(null)
  const demanderSuppression = (id: string) => setPieceASupprimer(documents.find((d) => d.id === id) ?? null)
  const [isUploading, setIsUploading] = useState(false)
  // 1.16 — un dépôt qui n'aboutit pas est dit ; les fichiers restants peuvent être renvoyés
  const [echec, setEchec] = useState<{ message: string; fichiers: File[] } | null>(null)
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)

  const expiringDocs = documents.filter(
    (d) => (d.status === 'expired' || d.status === 'expiring_soon') && d.expiry_date,
  )

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
          message: await messageErreur(err, `Le dépôt de « ${nom} » au coffre-fort n'a pas abouti.`),
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
    const noms = refus.map((r) => `« ${r.file.name} »`).join(', ')
    setEchec({ message: `${noms} : seuls les PDF de 20 Mo au plus sont acceptés.`, fichiers: [] })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptes) => { void deposer(acceptes) },
    onDropRejected,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 20 * 1024 * 1024,
  })

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
      {returnTo && (
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="inline-flex items-center gap-2 rounded-xs text-sm font-medium text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11"
        >
          <ArrowLeft size={15} aria-hidden />
          Retour à la vérification
        </button>
      )}
      <div className="flex items-center gap-3">
        <Archive size={24} className="text-accent-text" aria-hidden />
        <div>
          <h1 className="font-display text-h6 text-fg">Coffre-fort documentaire</h1>
          <p className="text-sm text-fg-2">{documents.length} documents stockés</p>
        </div>
      </div>

      {/* Expiry alerts */}
      {expiringDocs.length > 0 && (
        <div className="space-y-2">
          {expiringDocs.map((doc) => (
            <ExpiryAlert key={doc.id} expiryDate={doc.expiry_date!} documentName={doc.file_name} />
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-base ease-lien',
          isDragActive ? 'border-accent-ring bg-accent-tint' : 'border-input hover:border-fg-3 hover:bg-surface-1',
        )}
      >
        <input {...getInputProps()} />
        <Upload size={28} className="mx-auto mb-2 text-fg-3" aria-hidden />
        <p className="text-sm font-medium text-fg">
          {isUploading ? 'Envoi en cours…' : 'Glissez vos documents ici ou cliquez pour parcourir'}
        </p>
        <p className="mt-1 text-xs text-fg-3">PDF — 20 MB max</p>
      </div>

      {pieceASupprimer && (
        <DeleteConfirmModal
          title={`Supprimer « ${pieceASupprimer.file_name} » du coffre-fort ?`}
          detail="La pièce ne sera plus proposée pour vos candidatures."
          onConfirm={async () => { await deleteDocument(pieceASupprimer.id); setPieceASupprimer(null) }}
          onCancel={() => setPieceASupprimer(null)}
        />
      )}

      {echec && (
        <EchecAction
          calque
          message={echec.message}
          onReessayer={echec.fichiers.length > 0 ? () => { void deposer(echec.fichiers) } : undefined}
          onFermer={() => setEchec(null)}
        />
      )}

      {/* Documents par catégorie — « Non classés » en tête (à traiter) */}
      {isLoading ? (
        <DocumentListSkeleton count={6} />
      ) : (
        <>
          {(() => {
            const unclassified = documents.filter((d) => d.category === 'unclassified')
            if (unclassified.length === 0) return null
            return (
              <div className="rounded-xl border border-warning-border bg-warning-bg p-3">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
                  <Tag size={14} aria-hidden />
                  Non classés ({unclassified.length}) — à classer pour être utilisables dans vos candidatures
                </h2>
                <div className={LISTE_PIECES}>
                  {unclassified.map((doc) => (
                    <FileCard key={doc.id} document={doc} onDelete={demanderSuppression} onEdit={setEditingDoc} />
                  ))}
                </div>
              </div>
            )
          })()}

          {VAULT_CATEGORY_ORDER.map((category) => {
            const catDocs = documents.filter((d) => d.category === category)
            return (
              <div key={category}>
                <h2 className="mb-2 text-sm font-semibold text-fg-2">
                  {VAULT_CATEGORY_LABELS[category]}
                  <span className="ml-2 text-xs font-normal text-fg-3">({catDocs.length})</span>
                </h2>
                {catDocs.length > 0 ? (
                  <div className={LISTE_PIECES}>
                    {catDocs.map((doc) => (
                      <FileCard key={doc.id} document={doc} onDelete={demanderSuppression} onEdit={setEditingDoc} />
                    ))}
                  </div>
                ) : (
                  <p className="pb-1 text-xs text-fg-3">Aucun document</p>
                )}
              </div>
            )
          })}

          {documents.length === 0 && (
            <div className="py-16 text-center text-fg-3">
              <Archive size={40} className="mx-auto mb-3 text-fg-disabled" aria-hidden />
              <p>Votre coffre-fort est vide</p>
              <p className="mt-1 text-sm">Déposez vos documents administratifs pour les retrouver facilement</p>
            </div>
          )}
        </>
      )}

      {editingDoc && (
        <ClassifyDocumentModal document={editingDoc} onClose={() => setEditingDoc(null)} />
      )}
    </div>
  )
}
