import { useRef, useState } from 'react'
import { Download, Upload, ExternalLink } from 'lucide-react'
import type { ChecklistItem } from '@/types'
import SignatureLigne from '@/components/project/SignatureLigne'
import NonConcerneBouton, { estNonConcernee } from '@/components/project/NonConcerne'
import { noteDepot, statutPiece } from '@/lib/statutPiece'
import { SectionEtape } from '@/components/etape'
import { EtatDePiece, LignePiece, ListePieces } from '@/components/project/LignePiece'
import { MenuElement } from '@/components/ui/menu'
import { Bouton } from '@/components/ui/bouton'
import { Message } from '@/components/ui/message'
import EntreeFichier from '@/components/depot/EntreeFichier'
import { messageErreur } from '@/lib/erreurs'
import { nomPiece } from '@/lib/nomsPieces'
import { libelleSource } from '@/lib/resumeAO'
import { api } from '@/services/api'
import { typeAffichable } from '@/lib/adresseSure'
import { espacesFr } from '@/lib/espacesFr'

/** Les routes /api exigent le jeton (Bearer) : un lien nu ouvrait un onglet « 401 » (recette finale). La pièce est lue
 *  avec le jeton, puis montrée dans l'onglet ouvert pendant le clic (jamais bloqué comme une fenêtre surgissante). */
function ouvrirAvecJeton(e: React.MouseEvent<HTMLAnchorElement>): void {
  e.preventDefault()
  const chemin = (e.currentTarget.getAttribute('href') ?? '').replace(/^\/api/, '')
  const onglet = window.open('', '_blank')
  if (onglet) onglet.opener = null // P2-3 : l'onglet ne peut pas agir sur Synorix
  api.get<Blob>(chemin, { responseType: 'blob' })
    .then(({ data }) => { if (onglet) onglet.location.href = URL.createObjectURL(new Blob([data], { type: typeAffichable(data.type) })) })
    .catch(() => { onglet?.close() })
}

// Ordre d'affichage : AE en tête, puis les formulaires de candidature. La
// signature ne se déduit plus du type : règle serveur (SignatureLigne).
const ORDRE_FORMULAIRES = [
  'acte_engagement_template', 'dc1_template', 'dc2_template', 'declaration_honneur',
]

// Type (b) — formulaires nationaux standards jamais fournis dans le DCE : on
// pointe le formulaire officiel (DAJ / economie.gouv.fr, URL stable) que
// l'utilisateur télécharge, complète, puis réimporte.
const OFFICIAL_FORM_URLS: Record<string, string> = {
  dc1_template: 'https://www.economie.gouv.fr/daj/formulaires-declaration-du-candidat',
  dc2_template: 'https://www.economie.gouv.fr/daj/formulaires-declaration-du-candidat',
  dc4: 'https://www.economie.gouv.fr/daj/formulaires-declaration-du-candidat',
  declaration_honneur: 'https://www.economie.gouv.fr/daj/formulaires-declaration-du-candidat',
}

interface Props {
  projectId: string
  items: ChecklistItem[]
  onUploadCompleted: (item: ChecklistItem, file: File) => Promise<void>
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
  onOpenSource?: (item: ChecklistItem) => void
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
  /** Date limite de remise (AAAA-MM-JJ). */
  echeance?: string | null
}

export default function CandidatureSectionTemplates({
  projectId, items, onUploadCompleted, onToggleSignature, onOpenSource, onNonConcerne, echeance,
}: Props) {
  if (items.length === 0) return null

  // AE en tête, puis les formulaires de candidature, puis le reste.
  const sorted = [...items].sort((a, b) => {
    const rank = (i: ChecklistItem) => {
      const idx = ORDRE_FORMULAIRES.indexOf(i.document_type_required)
      return idx === -1 ? ORDRE_FORMULAIRES.length : idx
    }
    return rank(a) - rank(b)
  })

  return (
    <SectionEtape
      titre="Formulaires de l’acheteur"
      description="Téléchargez la trame de l’acheteur (ou le formulaire officiel), complétez-la, puis déposez-la ici."
    >
      <ListePieces>
      {sorted.map((item) => (
        <TemplateRow
          key={item.id}
          projectId={projectId}
          item={item}
          onUploadCompleted={onUploadCompleted}
          onToggleSignature={onToggleSignature}
          onOpenSource={onOpenSource}
          onNonConcerne={onNonConcerne}
          echeance={echeance}
        />
      ))}
      </ListePieces>
    </SectionEtape>
  )
}

/** La précision du serveur redit-elle le nom de la pièce (« DC1 — Lettre de candidature » sous « Lettre de candidature (DC1) ») ? */
export function redit(precision: string, nom: string): boolean {
  const mots = (t: string) => t.toLowerCase().replace(/[^a-z0-9àâçéèêëîïôùûü ]+/g, ' ').split(/\s+/).filter((m) => m.length > 2)
  const duNom = new Set(mots(nom))
  return mots(precision).every((m) => duNom.has(m))
}

function TemplateRow({
  projectId, item, onUploadCompleted, onToggleSignature, onOpenSource, onNonConcerne, echeance,
}: {
  echeance?: string | null
  projectId: string
  item: ChecklistItem
  onUploadCompleted: (item: ChecklistItem, file: File) => Promise<void>
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
  onOpenSource?: (item: ChecklistItem) => void
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
}) {
  const nonConcernee = estNonConcernee(item)
  const statut = statutPiece(item, echeance)
  const depot = noteDepot(item)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // B7 : un formulaire « À relire » est déposé lui aussi : sa version se voit, et il se remplace.
  const isPresent = item.status === 'present' || !!item.a_relire
  const isWarning = item.status === 'warning'
  const hasTemplate = !!item.template_project_doc_id
  const officialUrl = OFFICIAL_FORM_URLS[item.document_type_required]
  const label = nomPiece(item.document_type_required, null)

  const downloadHref = item.template_project_doc_id
    ? `/api/projects/${projectId}/documents/${item.template_project_doc_id}/preview`
    : undefined

  const completedHref = item.completed_project_doc_id
    ? `/api/projects/${projectId}/documents/${item.completed_project_doc_id}/preview`
    : undefined

  const handlePick = () => fileRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await onUploadCompleted(item, file)
    } catch (err: unknown) {
      setError(await messageErreur(err, 'Le formulaire rempli n’a pas pu être déposé. Réessayez dans un instant.'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const source = item.source_document ? libelleSource({ document: item.source_document, page: item.source_page ?? null }) : null
  const voirSource = item.source_exigence_id && onOpenSource ? () => onOpenSource(item) : undefined
  // Espaces insécables du français : « Fichier déposé : X » ne se coupe plus avant les deux-points (B7).
  const precision = espacesFr((item.details ?? '').trim())
  // D'où vient le formulaire, en une ligne : le fichier déposé, sinon le modèle à compléter (avec son lien), puis la source.
  const modele = item.jointe && item.piece_nom ? item.piece_nom : nonConcernee || isWarning ? null : hasTemplate ? 'Modèle de l’acheteur à compléter'
    // Type (b) : modèle officiel — normal qu'il ne soit pas au DCE. Aucun numéro de formulaire : service-public (F32144, F32106)
    // classe DC1/DC2/DUME en « Modèle de document ». Type (a) introuvable : à réclamer, pas une erreur.
    : officialUrl ? 'Modèle officiel (ministère de l’Économie)' : 'À demander au maître d’ouvrage'

  return (
    <LignePiece
      id={item.id}
      nom={label}
      sous={<>
        {precision && !redit(precision, label) && !/^[a-z0-9_-]+$/i.test(precision) && <p className="mt-0.5 break-words text-sm text-fg-2">{precision}</p>}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 break-words text-sm text-fg-2">
          {modele && <span>{modele}</span>}
          {/* Le modèle se télécharge par un lien, à côté de ce qu'il est : le seul bouton de la ligne est le dépôt. */}
          {nonConcernee ? null : hasTemplate && downloadHref ? (
            <Bouton asChild variante="lien"><a href={downloadHref} target="_blank" rel="noreferrer" onClick={ouvrirAvecJeton}><Download size={14} strokeWidth={1.5} aria-hidden />Télécharger la trame</a></Bouton>
          ) : officialUrl ? (
            <Bouton asChild variante="lien"><a href={officialUrl} target="_blank" rel="noreferrer" aria-label="Formulaire officiel, sur economie.gouv.fr (nouvel onglet)"><ExternalLink size={14} strokeWidth={1.5} aria-hidden />Formulaire officiel</a></Bouton>
          ) : null}
          {isPresent && completedHref && (
            <Bouton asChild variante="lien"><a href={completedHref} target="_blank" rel="noreferrer" onClick={ouvrirAvecJeton}>Voir la version déposée</a></Bouton>
          )}
        </p>
        {/* Signature : case seulement si elle est demandée, sinon la mention */}
        <SignatureLigne item={item} onToggleSignature={onToggleSignature} onOpenSource={onOpenSource} />
        {depot && <p className="piece-note">{depot}</p>}
        {source && <p className="piece-note">Source&nbsp;: {source}</p>}
        <EntreeFichier ref={fileRef} accept=".pdf,.docx,.xlsx,.xlsm,.xls,.ods" onChange={handleFile} />
      </>}
      etat={<EtatDePiece statut={statut} />}
      actions={nonConcernee ? null : (
        <Bouton variante="secondaire" onClick={handlePick} enCours={uploading} libelleEnCours="Dépôt en cours…">
          <Upload size={16} strokeWidth={1.5} aria-hidden />
          {isPresent ? 'Remplacer' : 'Déposer le formulaire'}
        </Bouton>
      )}
      menu={(
        <NonConcerneBouton item={item} onNonConcerne={onNonConcerne}>
          {voirSource && <MenuElement onSelect={voirSource}>Voir dans le dossier</MenuElement>}
        </NonConcerneBouton>
      )}
      pied={error && <Message ton="erreur" onFermer={() => setError(null)}>{error}</Message>}
    />
  )
}
