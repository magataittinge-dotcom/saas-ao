import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
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

export default function Vault() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Conserve le contexte AO : quand on arrive du parcours (ex. étape
  // Vérification), on offre un retour explicite sans perdre le projet.
  const returnTo = searchParams.get('returnTo')
  const { data: documents = [], isLoading } = useDocuments()
  const { mutate: deleteDocument } = useDeleteDocument()
  const [isUploading, setIsUploading] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)

  const expiringDocs = documents.filter(
    (d) => (d.status === 'expired' || d.status === 'expiring_soon') && d.expiry_date,
  )

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setIsUploading(true)
      try {
        for (const file of acceptedFiles) {
          await uploadService.uploadVaultDocument(file, 'autre')
        }
        queryClient.invalidateQueries({ queryKey: ['documents'] })
      } finally {
        setIsUploading(false)
      }
    },
    [queryClient],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 20 * 1024 * 1024,
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {returnTo && (
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="flex items-center gap-2 text-sm font-medium transition-colors hover:underline"
          style={{ color: '#22D3EE' }}
        >
          <ArrowLeft size={15} />
          Retour à la vérification
        </button>
      )}
      <div className="flex items-center gap-3">
        <Archive size={24} style={{ color: '#22D3EE' }} />
        <div>
          <h1 className="text-2xl font-bold text-ds-text">Coffre-fort documentaire</h1>
          <p className="text-sm text-ds-text-2">{documents.length} documents stockés</p>
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
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
        style={
          isDragActive
            ? { borderColor: '#22D3EE', background: 'rgba(34,211,238,0.05)' }
            : { borderColor: 'rgba(71,85,105,0.6)', background: 'transparent' }
        }
        onMouseEnter={(e) => {
          if (!isDragActive) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(154,163,174,0.8)'
        }}
        onMouseLeave={(e) => {
          if (!isDragActive) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(71,85,105,0.6)'
        }}
      >
        <input {...getInputProps()} />
        <Upload size={28} className="mx-auto text-ds-text-3 mb-2" />
        <p className="text-sm font-medium text-ds-text">
          {isUploading ? 'Upload en cours...' : 'Glissez vos documents ici ou cliquez pour parcourir'}
        </p>
        <p className="text-xs text-ds-text-3 mt-1">PDF — 20 MB max</p>
      </div>

      {/* Documents par catégorie — « Non classés » en tête (à traiter) */}
      {isLoading ? (
        <DocumentListSkeleton count={6} />
      ) : (
        <>
          {(() => {
            const unclassified = documents.filter((d) => d.category === 'unclassified')
            if (unclassified.length === 0) return null
            return (
              <div className="rounded-xl p-3"
                style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.20)' }}>
                <h2 className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: '#FBBF24' }}>
                  <Tag size={14} />
                  Non classés ({unclassified.length}) — à classer pour être utilisables dans vos candidatures
                </h2>
                <div className="space-y-2">
                  {unclassified.map((doc) => (
                    <FileCard key={doc.id} document={doc} onDelete={deleteDocument} onEdit={setEditingDoc} />
                  ))}
                </div>
              </div>
            )
          })()}

          {VAULT_CATEGORY_ORDER.map((category) => {
            const catDocs = documents.filter((d) => d.category === category)
            return (
              <div key={category} className={catDocs.length === 0 ? 'opacity-50' : undefined}>
                <h2 className="text-sm font-semibold text-ds-text-2 mb-2">
                  {VAULT_CATEGORY_LABELS[category]}
                  <span className="ml-2 text-xs font-normal text-ds-text-3">({catDocs.length})</span>
                </h2>
                {catDocs.length > 0 ? (
                  <div className="space-y-2">
                    {catDocs.map((doc) => (
                      <FileCard key={doc.id} document={doc} onDelete={deleteDocument} onEdit={setEditingDoc} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ds-text-3 pb-1">Aucun document</p>
                )}
              </div>
            )
          })}

          {documents.length === 0 && (
            <div className="text-center py-16 text-ds-text-3">
              <Archive size={40} className="mx-auto mb-3 opacity-30" />
              <p>Votre coffre-fort est vide</p>
              <p className="text-sm mt-1">Uploadez vos documents administratifs pour les retrouver facilement</p>
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
