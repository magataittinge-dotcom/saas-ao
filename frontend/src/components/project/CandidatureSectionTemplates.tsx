import { useRef, useState } from 'react'
import {
  Download, Upload, FileText, Loader2, ExternalLink,
} from 'lucide-react'
import type { ChecklistItem } from '@/types'
import SignatureLigne from '@/components/project/SignatureLigne'
import NonConcerneBouton, { estNonConcernee, piecesComptees } from '@/components/project/NonConcerne'
import { comptesPieces, libelleComptes, noteDepot, statutPiece } from '@/lib/statutPiece'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

const TEMPLATE_LABELS: Record<string, string> = {
  dc1_template: 'Formulaire DC1 — Lettre de candidature',
  dc2_template: 'Formulaire DC2 — Déclaration du candidat',
  acte_engagement_template: 'Acte d\'engagement',
  dpgf_template: 'DPGF',
  bpu_template: 'Bordereau de prix unitaires',
  dqe_template: 'Détail quantitatif estimatif',
  cadre_reponse: 'Cadre de réponse',
  attestation_visite_template: 'Attestation de visite',
  dc4: 'DC4 — Déclaration de sous-traitance',
  declaration_honneur: 'Déclaration sur l\'honneur',
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

  // « Non concerné » sort des comptes, comme dans le score du serveur
  const comptees = piecesComptees(items)
  const { aJoindre, pretes } = comptesPieces(comptees, echeance)
  // AE en tête, puis les formulaires de candidature, puis le reste.
  const sorted = [...items].sort((a, b) => {
    const rank = (i: ChecklistItem) => {
      const idx = ORDRE_FORMULAIRES.indexOf(i.document_type_required)
      return idx === -1 ? ORDRE_FORMULAIRES.length : idx
    }
    return rank(a) - rank(b)
  })

  return (
    <section
      className="glass-card rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', fontFamily: F }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <FileText size={18} style={{ color: '#E8E9EB' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: '#F7F8F8' }}>
              Documents à compléter
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#959597' }}>
              {libelleComptes(aJoindre, pretes, 'formulaire')} — téléchargez la trame (ou le formulaire officiel), complétez-la, puis réimportez la version finale
            </p>
          </div>
        </div>
      </header>

      <ul className="divide-y" style={{ borderColor: '#1E1E21' }}>
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
      </ul>
    </section>
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
  const label = TEMPLATE_LABELS[item.document_type_required] || item.document_type_required

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

  return (
    <li className="px-5 py-3 flex items-start gap-4">
      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: '#F7F8F8' }}>{label}</span>
          <span className={statut.classe}>{statut.texte}</span>
          {item.jointe && item.piece_nom ? (
            <span className="text-xs" style={{ color: '#959597' }}>{item.piece_nom}</span>
          ) : nonConcernee || isWarning ? null : hasTemplate ? (
            <span className="text-xs" style={{ color: '#959597' }}>Trame du DCE à compléter</span>
          ) : officialUrl ? (
            // Type (b) : modèle officiel — normal qu'il ne soit pas au DCE. Aucun numéro de formulaire :
            // service-public (F32144, F32106) classe DC1/DC2/DUME en « Modèle de document ».
            <span className="text-xs" style={{ color: '#959597' }}>Modèle officiel (ministère de l'Économie)</span>
          ) : (
            // Type (a) spécifique au DCE mais introuvable → à réclamer, pas une erreur.
            <span className="text-xs" style={{ color: '#959597' }}>À demander au maître d'ouvrage</span>
          )}
        </div>
        {/* Signature : case seulement si elle est demandée, sinon la mention */}
        <SignatureLigne item={item} onToggleSignature={onToggleSignature}
                  onOpenSource={onOpenSource} />
        {depot && <p className="piece-note">{depot}</p>}
        {item.details && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#959597' }}>
            {item.details}
          </p>
        )}
        {item.source_in_rc && (
          <p className="text-xs mt-1 italic" style={{ color: '#909195' }}>
            « {item.source_in_rc} »
          </p>
        )}
        {error && (
          <p className="text-xs mt-1.5" style={{ color: '#F58E86' }}>{error}</p>
        )}
      </div>

      {/* Actions — affordance UNIFORME : Télécharger (trame DCE ou officiel) /
          Importer rempli / (signature via la case ci-dessus, si demandée) */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <NonConcerneBouton item={item} onNonConcerne={onNonConcerne} />
        {nonConcernee ? null : hasTemplate && downloadHref ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-ds-bg-2"
            style={{ border: '1px solid rgba(255,255,255,.07)', color: '#959597' }}
          >
            <Download size={13} />
            Télécharger la trame
          </a>
        ) : officialUrl ? (
          <a
            href={officialUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-ds-bg-2"
            style={{ border: '1px solid rgba(255,255,255,.07)', color: '#959597' }}
            title="Formulaire officiel sur economie.gouv.fr (DAJ)"
          >
            <ExternalLink size={13} />
            Formulaire officiel
          </a>
        ) : null}
        {isPresent && completedHref && (
          <a
            href={completedHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-ds-bg-2"
            style={{ border: '1px solid rgba(255,255,255,.07)', color: '#959597' }}
          >
            <FileText size={13} />
            Voir version finale
          </a>
        )}
        {!nonConcernee && <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="btn-glass flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {uploading
            ? <><Loader2 size={13} className="animate-spin" /> Envoi...</>
            : <><Upload size={13} /> {isPresent ? 'Remplacer' : 'Importer rempli'}</>}
        </button>}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </div>
    </li>
  )
}
