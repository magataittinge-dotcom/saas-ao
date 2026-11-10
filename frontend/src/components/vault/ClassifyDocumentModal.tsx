import { useState } from 'react'
import { useUpdateDocument } from '@/hooks/useDocuments'
import { Bouton } from '@/components/ui/bouton'
import { Dialogue } from '@/components/ui/dialogue'
import { ChampDate, GroupeChamp } from '@/components/ui/champ'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { Message } from '@/components/ui/message'
import {
  CATEGORY_TYPES, DOC_TYPE_LABELS, VAULT_CATEGORY_LABELS, VAULT_CATEGORY_ORDER,
} from '@/lib/vault'
import type { Document, DocumentType, VaultCategory } from '@/types'

interface Props {
  document: Document
  onClose: () => void
}

type Rubrique = Exclude<VaultCategory, 'unclassified'>

/**
 * Ranger ou modifier une pièce du coffre-fort (rubrique → type → dates) : le Dialogue du système, ses listes et ses dates.
 * Le statut est recalculé par le serveur : type + date → prêt ; type sans date → « Date de validité à confirmer » ;
 * jamais « prêt » par défaut.
 */
export default function ClassifyDocumentModal({ document: doc, onClose }: Props) {
  const isUnclassified = doc.category === 'unclassified'
  const [category, setCategory] = useState<Rubrique>(isUnclassified ? 'attestations_sociales_fiscales' : (doc.category as Rubrique))
  const [type, setType] = useState<DocumentType>(isUnclassified ? CATEGORY_TYPES.attestations_sociales_fiscales[0] : doc.type)
  const [issuedDate, setIssuedDate] = useState(doc.issued_date ?? '')
  const [expiryDate, setExpiryDate] = useState(doc.expiry_date ?? '')
  const { mutate: updateDocument, isPending, error } = useUpdateDocument()

  const onCategoryChange = (cat: Rubrique) => {
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
    <Dialogue
      ouvert
      onOuvert={(ouvert) => { if (!ouvert && !isPending) onClose() }}
      taille="petit"
      titre={isUnclassified ? 'Ranger le document' : 'Modifier le document'}
      description={<span className="block truncate">{doc.file_name}</span>}
      actions={<>
        <Bouton variante="secondaire" onClick={onClose} disabled={isPending}>Annuler</Bouton>
        <Bouton variante="principal" onClick={onSubmit} enCours={isPending} libelleEnCours="Enregistrement…">Enregistrer</Bouton>
      </>}
    >
      <div className="grid gap-4">
        <GroupeChamp libelle="Rubrique">
          <ListeDeroulante
            valeur={category}
            onChange={(v) => onCategoryChange(v as Rubrique)}
            options={VAULT_CATEGORY_ORDER.map((cat) => ({ valeur: cat, libelle: VAULT_CATEGORY_LABELS[cat] }))}
          />
        </GroupeChamp>
        <GroupeChamp libelle="Type de pièce">
          <ListeDeroulante
            valeur={type}
            onChange={(v) => setType(v as DocumentType)}
            options={CATEGORY_TYPES[category].map((t) => ({ valeur: t, libelle: DOC_TYPE_LABELS[t] ?? t }))}
          />
        </GroupeChamp>
        <div className="grid grid-cols-2 gap-3">
          <GroupeChamp libelle="Émise le" facultatif>
            <ChampDate valeur={issuedDate} onChange={(iso) => setIssuedDate(iso ?? '')} />
          </GroupeChamp>
          <GroupeChamp libelle="Valable jusqu’au" aide={!expiryDate && type !== 'autre' ? 'Sans cette date, la validité reste à confirmer.' : undefined}>
            <ChampDate valeur={expiryDate} onChange={(iso) => setExpiryDate(iso ?? '')} />
          </GroupeChamp>
        </div>
        {error && <Message ton="erreur">L’enregistrement n’a pas abouti. Vos choix sont gardés : réessayez.</Message>}
      </div>
    </Dialogue>
  )
}
