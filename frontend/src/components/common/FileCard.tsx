import { FileText, Trash2, ExternalLink, Tag, Pencil } from 'lucide-react'
import { DOC_TYPE_LABELS } from '@/lib/vault'
import { noteValidite, statutDocument } from '@/lib/statutPiece'
import { getSignedFileUrl } from '@/services/api'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'
import { Infobulle } from '@/components/ui/infobulle'
import { StatusBadge, documentStatusBadge } from './StatusBadge'
import type { Document } from '@/types'

interface Props {
  document: Document
  onDelete?: (id: string) => void
  onEdit?: (document: Document) => void
}

/**
 * Une pièce du coffre-fort, en rangée : son type, son nom de fichier, son état (un mot), puis ses gestes (ranger ou modifier,
 * ouvrir, supprimer). Boutons du système, cibles de 44 px, infobulles du système (plus de `title=` natif).
 */
export function FileCard({ document, onDelete, onEdit }: Props) {
  const badge = documentStatusBadge(document.status)
  const statut = statutDocument(document)
  const note = noteValidite(document.type)
  const isUnclassified = document.status === 'unclassified'

  const openFile = async () => {
    try {
      const url = await getSignedFileUrl(document.file_url)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('[FileCard] impossible d’obtenir le lien signé:', err)
    }
  }

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-2 rounded-lg border border-bord bg-surface-0 py-1.5 pl-3 pr-1.5 transition-colors duration-fast ease-survol hover:border-bord-2">
      <div className="flex min-w-0 items-center gap-3">
        <FileText aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-2" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {isUnclassified ? document.file_name : (DOC_TYPE_LABELS[document.type] ?? document.type)}
          </p>
          {!isUnclassified && <p className="truncate text-xs text-fg-2">{document.file_name}</p>}
          {!isUnclassified && note && <p className="piece-note">{note}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isUnclassified
          ? <StatusBadge label={badge.label} variant={badge.variant} />
          : <span className={statut.classe}>{statut.texte}</span>}
        {onEdit && (isUnclassified
          ? <Bouton variante="secondaire" onClick={() => onEdit(document)}><Tag aria-hidden />Ranger</Bouton>
          : <Infobulle texte="Modifier la catégorie, le type ou les dates"><BoutonIcone libelle={`Modifier ${document.file_name}`} onClick={() => onEdit(document)}><Pencil aria-hidden strokeWidth={1.5} /></BoutonIcone></Infobulle>)}
        <Infobulle texte="Ouvrir le document"><BoutonIcone libelle={`Ouvrir ${document.file_name}`} onClick={() => { void openFile() }}><ExternalLink aria-hidden strokeWidth={1.5} /></BoutonIcone></Infobulle>
        {onDelete && <BoutonIcone libelle={`Supprimer ${document.file_name}`} onClick={() => onDelete(document.id)}><Trash2 aria-hidden strokeWidth={1.5} /></BoutonIcone>}
      </div>
    </div>
  )
}
