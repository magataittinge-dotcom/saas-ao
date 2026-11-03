import { useRef, useState } from 'react'
import {
  Download, Upload, FileText, Loader2, ExternalLink,
} from 'lucide-react'
import type { ChecklistItem } from '@/types'
import SignatureLigne from '@/components/project/SignatureLigne'
import NonConcerneBouton, { estNonConcernee } from '@/components/project/NonConcerne'
import { noteDepot, statutPiece } from '@/lib/statutPiece'
import { EtatElement, SectionEtape } from '@/components/etape'
import { Button } from '@/components/ui/button'
import { nomPiece } from '@/lib/nomsPieces'
import { etatDeStatut } from '@/lib/resumePieces'
import { libelleSource } from '@/lib/resumeAO'

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
      colonnes={2}
      description="Téléchargez la trame (ou le formulaire officiel), complétez-la, puis réimportez la version finale."
    >
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
    </SectionEtape>
  )
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

  const isPresent = item.status === 'present'
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
      const msg = err instanceof Error ? err.message : 'L\'envoi n\'a pas abouti'
      setError(msg)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const { etat, texte, perimee } = etatDeStatut(statut)
  const source = item.source_document ? libelleSource({ document: item.source_document, page: item.source_page ?? null }) : null
  const lien = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-bord-2 px-3 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11'

  return (
    <div data-piece={item.id} className="grid min-w-0 content-start gap-2 rounded-carte border border-bord-2 bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <FileText size={18} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
          <p className="min-w-0 break-words font-semibold text-fg">{label}</p>
        </div>
        <NonConcerneBouton item={item} onNonConcerne={onNonConcerne} />
      </div>
      <p className="break-words pl-[1.875rem] text-sm text-fg-2">
        {item.jointe && item.piece_nom ? item.piece_nom : nonConcernee || isWarning ? null : hasTemplate ? 'Modèle de l’acheteur à compléter'
          // Type (b) : modèle officiel — normal qu'il ne soit pas au DCE. Aucun numéro de formulaire : service-public (F32144, F32106)
          // classe DC1/DC2/DUME en « Modèle de document ». Type (a) introuvable : à réclamer, pas une erreur.
          : officialUrl ? 'Modèle officiel (ministère de l\'Économie)' : 'À demander au maître d’ouvrage'}
      </p>
      {/* Signature : case seulement si elle est demandée, sinon la mention */}
      <SignatureLigne item={item} onToggleSignature={onToggleSignature} onOpenSource={onOpenSource} />
      {depot && <p className="piece-note">{depot}</p>}
      {item.details && item.details.trim() !== label && !/^[a-z0-9_-]+$/i.test(item.details.trim()) && (
        <p className="text-sm leading-relaxed text-fg-3">{item.details}</p>
      )}
      {item.source_in_rc && <p className="text-sm italic text-fg-3">« {item.source_in_rc} »</p>}
      {error && <p className="text-sm" style={{ color: 'var(--danger-fg)' }}>{error}</p>}

      <div className="mt-auto grid gap-2.5 border-t border-bord-2 pt-2.5">
        <EtatElement
          etat={etat}
          texte={texte}
          perimee={perimee}
          source={source ? { libelle: source, onVoir: item.source_exigence_id && onOpenSource ? () => onOpenSource(item) : undefined } : undefined}
        />
        {/* Actions — affordance UNIFORME : Télécharger (trame du dossier ou officiel) / Importer rempli */}
        <div className="flex flex-wrap items-center gap-2">
          {nonConcernee ? null : hasTemplate && downloadHref ? (
            <a href={downloadHref} target="_blank" rel="noreferrer" className={lien}>
              <Download size={14} aria-hidden /> Télécharger la trame
            </a>
          ) : officialUrl ? (
            <a href={officialUrl} target="_blank" rel="noreferrer" className={lien} title="Formulaire officiel sur economie.gouv.fr (DAJ)">
              <ExternalLink size={14} aria-hidden /> Formulaire officiel
            </a>
          ) : null}
          {isPresent && completedHref && (
            <a href={completedHref} target="_blank" rel="noreferrer" className={lien}>
              <FileText size={14} aria-hidden /> Voir version finale
            </a>
          )}
          {!nonConcernee && (
            <Button type="button" variant="outline" size="sm" onClick={handlePick} disabled={uploading} className="[@media(pointer:coarse)]:min-h-11">
              {uploading
                ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Envoi...</>
                : <><Upload size={14} aria-hidden /> {isPresent ? 'Remplacer' : 'Importer rempli'}</>}
            </Button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.xlsm,.xls,.ods" onChange={handleFile} className="hidden" />
    </div>
  )
}
