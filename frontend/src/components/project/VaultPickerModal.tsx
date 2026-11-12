import { useMemo, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import { DOC_TYPE_LABELS, vaultValidityPill, type VaultPillTone } from '@/lib/vault'
import { nomPiece } from '@/lib/nomsPieces'
import { messageErreur } from '@/lib/erreurs'
import { Bouton } from '@/components/ui/bouton'
import { ChampRecherche } from '@/components/ui/champ'
import { Dialogue } from '@/components/ui/dialogue'
import { EtatErreur } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { PastilleEtat, type Sens } from '@/components/ui/pastille'
import { Squelette } from '@/components/ui/squelette'
import EntreeFichier from '@/components/depot/EntreeFichier'
import type { ChecklistItem, Document } from '@/types'

interface Props {
  item: ChecklistItem
  onClose: () => void
  onLink: (doc: Document) => Promise<void>
  /** Déposer un NOUVEAU fichier pour cette pièce (ajout au coffre-fort, puis rattachement). */
  onUploadNew: (file: File) => Promise<void>
}

// B1 : « Prêt » seulement pour une pièce reconnue et datée (règle commune lib/vault) ; le mot vient de là, la couleur d'ici.
const SENS: Record<VaultPillTone, Sens> = { ok: 'vert', attention: 'ambre', alert: 'rouge', neutral: 'gris' }

/**
 * « Choisir une pièce du coffre-fort » : le dialogue du système (piège de focus, Échap, retour du focus). Les pièces du type
 * demandé d'abord, puis les autres ; un fichier qui n'est pas encore au coffre-fort se dépose d'ici. Aucun aplat : le geste
 * principal de l'écran reste celui de l'étape.
 */
export default function VaultPickerModal({ item, onClose, onLink, onUploadNew }: Props) {
  const requete = useDocuments()
  const documents = useMemo(() => requete.data ?? [], [requete.data])
  const [query, setQuery] = useState('')
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const required = item.document_type_required
  const nom = nomPiece(required, item.details)

  const { candidates, others } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const trouves = documents.filter((d) => !q || d.file_name.toLowerCase().includes(q))
    const duType = (d: Document) => d.type === required || required === 'autre' || !required
    return { candidates: trouves.filter(duType), others: trouves.filter((d) => d.type !== required && !duType(d)) }
  }, [documents, required, query])

  const handleLink = async (doc: Document) => {
    setError(null)
    setLinking(doc.id)
    try {
      await onLink(doc)
      onClose()
    } catch (err: unknown) {
      setError(await messageErreur(err, 'La pièce n’a pas pu être rattachée. Réessayez dans un instant.'))
    } finally {
      setLinking(null)
    }
  }

  const handleUpload = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      await onUploadNew(file)
      onClose()
    } catch (err: unknown) {
      setError(await messageErreur(err, 'Le fichier n’a pas pu être déposé. Réessayez dans un instant.'))
    } finally {
      setUploading(false)
    }
  }

  const occupe = linking !== null || uploading

  return (
    <Dialogue
      ouvert
      onOuvert={(ouvert) => { if (!ouvert) onClose() }}
      titre="Choisir une pièce du coffre-fort"
      description={<>Pour : {nom}</>}
      // Une seule fermeture (la croix) et un seul bouton : déposer. Il est LE geste quand aucune pièce du type demandé n'est au coffre.
      actions={<>
        <Bouton variante={candidates.length === 0 && !requete.isLoading ? 'principal' : 'secondaire'} disabled={occupe} enCours={uploading} libelleEnCours="Dépôt en cours…" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden size={16} strokeWidth={1.5} />
          Déposer un nouveau fichier
        </Bouton>
      </>}
    >
      <EntreeFichier
        ref={fileInputRef}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f)
          e.target.value = ''
        }}
      />
      {error && <Message ton="erreur" onFermer={() => setError(null)}>{error}</Message>}

      {requete.isLoading ? (
        <div aria-busy="true" className="grid gap-2">
          {[0, 1, 2].map((i) => <Squelette key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : requete.isError && requete.data === undefined ? (
        <EtatErreur
          titre="Le coffre-fort n’a pas pu se charger"
          detail="Vos pièces restent en place. Vous pouvez aussi déposer un nouveau fichier."
          onReessayer={() => { void requete.refetch() }}
          enCours={requete.isFetching}
        />
      ) : documents.length === 0 ? (
        <p className="text-sm text-fg-2">Votre coffre-fort ne contient pas encore de pièce. Déposez le fichier ici : il y sera rangé, puis joint à ce dossier.</p>
      ) : (
        <>
          {/* La recherche n'apparaît que lorsqu'il y a de quoi chercher */}
          {(documents.length > 6 || query.trim()) && (
            <ChampRecherche
              aria-label="Rechercher une pièce par son nom de fichier"
              placeholder="Rechercher par nom de fichier"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div className="-mx-2 grid max-h-80 content-start gap-4 overflow-y-auto px-2">
            <Group
              title="Du type demandé"
              docs={candidates}
              onLink={handleLink}
              linkingId={linking}
              occupe={occupe}
              emptyText={query.trim() ? 'Aucune pièce de ce type ne porte ce nom.' : 'Déposez cette pièce ici : elle sera rangée dans votre coffre-fort, puis jointe à ce dossier.'}
            />
            {others.length > 0 && (
              <Group title="Autres pièces du coffre-fort" docs={others} onLink={handleLink} linkingId={linking} occupe={occupe} />
            )}
          </div>
        </>
      )}
    </Dialogue>
  )
}

function Group({
  title, docs, onLink, linkingId, occupe, emptyText,
}: {
  title: string
  docs: Document[]
  onLink: (doc: Document) => void
  linkingId: string | null
  occupe: boolean
  emptyText?: string
}) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-medium text-fg-2">{title}</h3>
      {docs.length === 0 ? (
        emptyText ? <p className="text-sm text-fg-2">{emptyText}</p> : null
      ) : (
        <ul className="grid">
          {docs.map((doc) => {
            const { label, tone } = vaultValidityPill(doc)
            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-bord py-2.5 last:border-b-0">
                <div className="grid min-w-0 flex-1 basis-48 gap-1">
                  <p className="break-words text-sm font-medium text-fg">{doc.file_name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-fg-3">{DOC_TYPE_LABELS[doc.type] ?? 'Autre pièce'}</span>
                    <PastilleEtat sens={SENS[tone]}>{label}</PastilleEtat>
                  </div>
                </div>
                <Bouton variante="secondaire" className="shrink-0" disabled={occupe} enCours={linkingId === doc.id} libelleEnCours="Rattachement…"
                  aria-label={`Choisir ${doc.file_name}`} onClick={() => onLink(doc)}>
                  Choisir
                </Bouton>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
