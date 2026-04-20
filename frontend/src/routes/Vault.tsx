import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Archive } from 'lucide-react'
import { useDocuments, useDeleteDocument } from '@/hooks/useDocuments'
import { uploadService } from '@/services/upload'
import { FileCard } from '@/components/common/FileCard'
import { ExpiryAlert } from '@/components/common/ExpiryAlert'
import { useQueryClient } from '@tanstack/react-query'
import type { DocumentType } from '@/types'

const CATEGORIES: { label: string; types: DocumentType[] }[] = [
  { label: 'Assurances', types: ['decennale', 'rc_civile'] },
  { label: 'Social', types: ['urssaf', 'pro_btp', 'cibtp'] },
  { label: 'Fiscal', types: ['fiscal'] },
  { label: 'Juridique', types: ['kbis', 'declaration_honneur', 'pouvoir'] },
  { label: 'Qualifications', types: ['qualibat', 'caces', 'amiante_ss4'] },
  { label: 'Formulaires', types: ['dc1', 'dc2', 'rib'] },
  { label: 'Entreprise', types: ['organigramme_doc', 'chiffre_affaires', 'effectifs'] },
  { label: 'Autres', types: ['autre'] },
]

export default function Vault() {
  const queryClient = useQueryClient()
  const { data: documents = [] } = useDocuments()
  const { mutate: deleteDocument } = useDeleteDocument()
  const [isUploading, setIsUploading] = useState(false)

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
      <div className="flex items-center gap-3">
        <Archive size={24} style={{ color: '#0EA5E9' }} />
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
            ? { borderColor: '#0EA5E9', background: 'rgba(14,165,233,0.05)' }
            : { borderColor: 'rgba(71,85,105,0.6)', background: 'transparent' }
        }
        onMouseEnter={(e) => {
          if (!isDragActive) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(100,116,139,0.8)'
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

      {/* Documents by category */}
      {CATEGORIES.map(({ label, types }) => {
        const catDocs = documents.filter((d) => types.includes(d.type))
        if (catDocs.length === 0) return null
        return (
          <div key={label}>
            <h2 className="text-sm font-semibold text-ds-text-2 mb-2">{label}</h2>
            <div className="space-y-2">
              {catDocs.map((doc) => (
                <FileCard key={doc.id} document={doc} onDelete={deleteDocument} />
              ))}
            </div>
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
    </div>
  )
}
