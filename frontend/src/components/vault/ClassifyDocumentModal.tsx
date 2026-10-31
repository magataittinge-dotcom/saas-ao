import { useState } from 'react'
import { useUpdateDocument } from '@/hooks/useDocuments'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, classeChamp } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CATEGORY_TYPES, DOC_TYPE_LABELS, VAULT_CATEGORY_LABELS, VAULT_CATEGORY_ORDER,
} from '@/lib/vault'
import type { Document, DocumentType, VaultCategory } from '@/types'

interface Props {
  document: Document
  onClose: () => void
}

// Listes natives : le bord, les états et la hauteur des champs du socle.
const selectClass = cn(classeChamp, 'h-10 [@media(pointer:coarse)]:h-11')
const etiquette = 'mb-1 block text-xs font-medium text-fg-2'

/**
 * Classement / modification manuelle d'un document du coffre-fort
 * (catégorie → type → dates). Le statut est recalculé côté backend :
 * type + date → valide ; type sans date → « à vérifier » ; jamais
 * « valide » par défaut.
 */
export default function ClassifyDocumentModal({ document: doc, onClose }: Props) {
  const isUnclassified = doc.category === 'unclassified'
  const [category, setCategory] = useState<Exclude<VaultCategory, 'unclassified'>>(
    isUnclassified ? 'attestations_sociales_fiscales' : (doc.category as Exclude<VaultCategory, 'unclassified'>),
  )
  const [type, setType] = useState<DocumentType>(
    isUnclassified ? CATEGORY_TYPES['attestations_sociales_fiscales'][0] : doc.type,
  )
  const [issuedDate, setIssuedDate] = useState(doc.issued_date ?? '')
  const [expiryDate, setExpiryDate] = useState(doc.expiry_date ?? '')
  const { mutate: updateDocument, isPending, error } = useUpdateDocument()

  const onCategoryChange = (cat: Exclude<VaultCategory, 'unclassified'>) => {
    setCategory(cat)
    setType(CATEGORY_TYPES[cat][0])
  }

  const onSubmit = () => {
    updateDocument(
      {
        id: doc.id,
        payload: {
          type,
          category,
          ...(issuedDate ? { issued_date: issuedDate } : {}),
          ...(expiryDate ? { expiry_date: expiryDate } : {}),
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open onOpenChange={(ouvert) => { if (!ouvert) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="text-base font-bold text-fg">
            {isUnclassified ? 'Ranger le document' : 'Modifier le document'}
          </DialogTitle>
          <DialogDescription className="truncate text-xs text-fg-3">{doc.file_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="classer-categorie" className={etiquette}>Catégorie</label>
            <select
              id="classer-categorie"
              className={selectClass}
              value={category}
              onChange={(e) => onCategoryChange(e.target.value as Exclude<VaultCategory, 'unclassified'>)}
            >
              {VAULT_CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>{VAULT_CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="classer-type" className={etiquette}>Type de document</label>
            <select
              id="classer-type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
            >
              {CATEGORY_TYPES[category].map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="classer-emission" className={etiquette}>Date d'émission</label>
              <Input id="classer-emission" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="classer-validite" className={etiquette}>Valide jusqu'au</label>
              <Input id="classer-validite" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          {!expiryDate && type !== 'autre' && (
            <p className="text-xs text-warning">
              Sans date de validité, le document restera « ⚠️ À vérifier ».
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              Enregistrement impossible — réessayez.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 pt-3 sm:space-x-0">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
