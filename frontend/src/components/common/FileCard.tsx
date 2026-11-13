import { FileText, Trash2, ExternalLink, Tag, Pencil } from 'lucide-react'
import { DOC_TYPE_LABELS } from '@/lib/vault'
import { noteValidite, statutDocument } from '@/lib/statutPiece'
import { dateDuJourParis } from '@/lib/dateParis'
import { getSignedFileUrl } from '@/services/api'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'
import { Infobulle } from '@/components/ui/infobulle'
import type { Document } from '@/types'
import { resumeErreur } from '@/lib/erreurs'

interface Props {
  document: Document
  onDelete?: (id: string) => void
  onEdit?: (document: Document) => void
}

/**
 * Une pièce du coffre-fort : une RANGÉE d'une surface (un filet la sépare de la précédente ; elle n'a ni cadre ni rayon
 * à elle : 500 pièces ne font pas 500 cartes). À gauche son type (ou son nom de fichier tant qu'elle n'est pas rangée) et
 * une ligne de précision (nom du fichier, ou date du dépôt) ; à droite son état en mots puis ses gestes (ranger ou
 * modifier, ouvrir, supprimer). Une pièce à ranger ne porte pas de pastille « À ranger » : le titre de sa section et son
 * bouton « Ranger » le disent déjà.
 * Au téléphone, toujours deux lignes : le nom (coupé par des points de suspension, jamais plus large que l'écran), puis
 * l'état et les gestes. Boutons du système, cibles de 44 px, infobulles du système.
 */
export function FileCard({ document, onDelete, onEdit }: Props) {
  const statut = statutDocument(document)
  const note = noteValidite(document.type)
  const isUnclassified = document.status === 'unclassified'
  // « 3 juillet 2026 » : avec l'année (une attestation a une durée de validité ; jury, tour 3), sans le jour de la semaine
  const depose = document.uploaded_at ? dateDuJourParis(document.uploaded_at).split(' ').slice(1).join(' ') : ''

  const openFile = async () => {
    try {
      const url = await getSignedFileUrl(document.file_url)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('[FileCard] impossible d’obtenir le lien signé:', resumeErreur(err))
    }
  }

  return (
    <div data-piece="" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 border-t border-bord py-2 first:border-t-0 sm:min-h-[52px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <FileText aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-2" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {isUnclassified ? document.file_name : (DOC_TYPE_LABELS[document.type] ?? document.type)}
          </p>
          {isUnclassified
            ? depose && <p className="truncate text-xs text-fg-2 max-sm:hidden">Déposée le {depose}</p>
            : <p className="truncate text-xs text-fg-2">{document.file_name}</p>}
          {!isUnclassified && note && <p className="piece-note">{note}</p>}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 max-sm:pl-[30px] sm:justify-end">
        {isUnclassified
          ? onEdit && <Bouton variante="secondaire" onClick={() => onEdit(document)}><Tag aria-hidden />Ranger</Bouton>
          : <span className={statut.classe}>{statut.texte}</span>}
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && !isUnclassified && (
            <Infobulle texte="Modifier la catégorie, le type ou les dates"><BoutonIcone libelle={`Modifier ${document.file_name}`} onClick={() => onEdit(document)}><Pencil aria-hidden strokeWidth={1.5} /></BoutonIcone></Infobulle>
          )}
          <Infobulle texte="Ouvrir la pièce"><BoutonIcone libelle={`Ouvrir ${document.file_name}`} onClick={() => { void openFile() }}><ExternalLink aria-hidden strokeWidth={1.5} /></BoutonIcone></Infobulle>
          {onDelete && <BoutonIcone libelle={`Supprimer ${document.file_name}`} onClick={() => onDelete(document.id)}><Trash2 aria-hidden strokeWidth={1.5} /></BoutonIcone>}
        </div>
      </div>
    </div>
  )
}
