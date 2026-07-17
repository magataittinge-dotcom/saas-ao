import { useRef, useState } from 'react'
import {
  CheckCircle2, AlertCircle, Download, Upload, FileText, Loader2, ExternalLink,
} from 'lucide-react'
import type { ChecklistItem } from '@/types'

const F = "'Geist Sans', sans-serif"

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

// C12 — documents exigeant une signature du candidat.
const SIGNABLE_TYPES = [
  'acte_engagement_template', 'dc1_template', 'dc2_template', 'declaration_honneur',
]

// Type (b) — formulaires nationaux standards jamais fournis dans le DCE : on
// pointe le formulaire officiel (DAJ / economie.gouv.fr, URL stable) que
// l'utilisateur télécharge, complète/signe, puis réimporte.
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
}

export default function CandidatureSectionTemplates({ projectId, items, onUploadCompleted, onToggleSignature }: Props) {
  if (items.length === 0) return null

  const present = items.filter((i) => i.status === 'present').length
  // AE en tête, puis les autres documents à signer, puis le reste.
  const sorted = [...items].sort((a, b) => {
    const rank = (i: ChecklistItem) => {
      const idx = SIGNABLE_TYPES.indexOf(i.document_type_required)
      return idx === -1 ? SIGNABLE_TYPES.length : idx
    }
    return rank(a) - rank(b)
  })

  return (
    <section
      className="bg-ds-bg rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#0F2B33' }}
          >
            <FileText size={18} style={{ color: '#22D3EE' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: '#E7EAEE' }}>
              Documents à compléter et signer
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#9AA3AE' }}>
              {present}/{items.length} complétés — téléchargez la trame (ou le formulaire officiel), complétez et signez, puis réimportez la version finale
            </p>
          </div>
        </div>
      </header>

      <ul className="divide-y" style={{ borderColor: '#232730' }}>
        {sorted.map((item) => (
          <TemplateRow
            key={item.id}
            projectId={projectId}
            item={item}
            onUploadCompleted={onUploadCompleted}
            onToggleSignature={onToggleSignature}
          />
        ))}
      </ul>
    </section>
  )
}

function TemplateRow({
  projectId, item, onUploadCompleted, onToggleSignature,
}: {
  projectId: string
  item: ChecklistItem
  onUploadCompleted: (item: ChecklistItem, file: File) => Promise<void>
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPresent = item.status === 'present'
  const isWarning = item.status === 'warning'
  const hasTemplate = !!item.template_project_doc_id
  const officialUrl = OFFICIAL_FORM_URLS[item.document_type_required]
  const isSignable = SIGNABLE_TYPES.includes(item.document_type_required)
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
      const msg = err instanceof Error ? err.message : 'Échec de l\'upload'
      setError(msg)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <li className="px-6 py-4 flex items-start gap-4">
      {/* Status icon */}
      <span className="shrink-0 mt-0.5">
        {isPresent
          ? <CheckCircle2 size={18} style={{ color: '#34D399' }} />
          : isWarning
            ? <AlertCircle size={18} style={{ color: '#FBBF24' }} />
            : <AlertCircle size={18} style={{ color: hasTemplate ? '#9AA3AE' : '#F87171' }} />}
      </span>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: '#E7EAEE' }}>{label}</span>
          {isPresent ? (
            <span className="text-[11px]" style={{ color: '#34D399' }}>Complété</span>
          ) : isWarning ? (
            <span className="text-[11px] font-medium" style={{ color: '#FBBF24' }}>
              ⚠️ Présente — à vérifier
            </span>
          ) : hasTemplate ? (
            <span className="text-[11px]" style={{ color: '#9AA3AE' }}>À compléter</span>
          ) : officialUrl ? (
            // Type (b) : formulaire standard — normal qu'il ne soit pas au DCE.
            <span className="text-[11px]" style={{ color: '#9AA3AE' }}>Formulaire standard (Cerfa)</span>
          ) : (
            // Type (a) spécifique au DCE mais introuvable → à réclamer, pas une erreur.
            <span className="text-[11px]" style={{ color: '#9AA3AE' }}>À demander au maître d'ouvrage</span>
          )}
        </div>
        {/* C12 — confirmation de signature (AE, DC1, DC2) */}
        {isSignable && onToggleSignature && (
          <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer" style={{ color: '#9AA3AE' }}>
            <input
              type="checkbox"
              checked={item.signature_confirmed ?? false}
              onChange={(e) => onToggleSignature(item, e.target.checked)}
            />
            Je confirme avoir signé ce document
            {!item.signature_confirmed && (
              <span style={{ color: '#6B7280' }}>— requis pour compter conforme</span>
            )}
          </label>
        )}
        {item.details && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#9AA3AE' }}>
            {item.details}
          </p>
        )}
        {item.source_in_rc && (
          <p className="text-[11px] mt-1 italic" style={{ color: '#6B7280' }}>
            « {item.source_in_rc} »
          </p>
        )}
        {error && (
          <p className="text-[11px] mt-1.5" style={{ color: '#F87171' }}>{error}</p>
        )}
      </div>

      {/* Actions — affordance UNIFORME : Télécharger (trame DCE ou officiel) /
          Importer rempli / (Signé via la case ci-dessus) */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {hasTemplate && downloadHref ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-ds-bg-2"
            style={{ border: '1px solid rgba(255,255,255,0.06)', color: '#9AA3AE' }}
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
            style={{ border: '1px solid rgba(255,255,255,0.06)', color: '#9AA3AE' }}
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
            style={{ border: '1px solid rgba(255,255,255,0.06)', color: '#9AA3AE' }}
          >
            <FileText size={13} />
            Voir version finale
          </a>
        )}
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${isPresent ? 'btn-glass' : 'edge-cta'}`}
        >
          {uploading
            ? <><Loader2 size={13} className="animate-spin" /> Envoi...</>
            : <><Upload size={13} /> {isPresent ? 'Remplacer' : 'Importer rempli'}</>}
        </button>
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
