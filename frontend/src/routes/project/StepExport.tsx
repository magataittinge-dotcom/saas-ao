import { useState, useCallback, useMemo } from 'react'
import { jourCourtParis } from '@/lib/dateParis'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileDown, Archive, CheckCircle2, Circle, Loader2,
  AlertTriangle, Upload,
  ExternalLink, FileSpreadsheet, FileText, Eye,
  Download,
} from 'lucide-react'
import { api } from '@/services/api'
import type { Project } from '@/types'
import DocumentViewer, { type ViewableDocument } from '@/components/project/DocumentViewer'
import { DocumentRowSkeleton } from '@/components/skeletons'
import EchecAction from '@/components/common/EchecAction'
import { phraseSourceSignature, signatureAConfirmer } from '@/components/project/SignatureLigne'
import PiecesAJoindre from '@/components/project/PiecesAJoindre'
import { MenuPlus } from '@/components/project/BarreEtape'
import { GabaritEtape, BandeResume, BarreEtape, BilanBarre, ActionsBarreTel, SectionEtape, EtatElement } from '@/components/etape'
import { cartesPieces } from '@/lib/resumePieces'
import ExigencesDuDossier, { type ExigenceExport } from '@/components/project/ExigencesDuDossier'
import {
  etatPiece, ligneEtatDossier, lignesDuScore, lireAvertissementsExport, pieceDemandee, resumeExigences, type GroupeExigences,
} from '@/lib/exportDossier'
import { messageErreur } from '@/lib/erreurs'
import { Sigle } from '@/components/common/Sigle'
import { developper } from '@/lib/lexique'
import { noteDepot } from '@/lib/statutPiece'
import { libellePassagesACompleter } from '@/lib/passagesACompleter'
import { echeanceAO } from '@/lib/echeance'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

// ─── Types ──────────────────────────────────────────────────────────────────


interface ChecklistExportItem {
  id: string
  document_type_required: string
  status: string
  details: string | null
  linked_document_name: string | null
  linked_document_id: string | null
  source_kind: string
  signature_confirmed: boolean
  signature_required: boolean
  document_group: string
  // Décision du 25/10 (point 3) : « Jointe » = fait vérifié par le serveur
  jointe: boolean
  piece_nom: string | null
  valable_jusqu_au: string | null
  // Lecture du RC (serveur) : statuts « Si concerné », « Facultatif », « Pour l'attribution »
  obligation?: 'obligatoire' | 'si_concerne' | 'facultatif'
  phase?: 'depot' | 'attribution'
  // « Déposé le … par … » et source de la signature lue dans le RC (comme l'écran des pièces)
  depose_le?: string | null
  depose_par?: string | null
  source_document?: string | null
  source_page?: number | null
  source_article?: string | null
  source_exigence_id?: string | null
}

// Exactement ce que le ZIP contient (même plan que l'archive, côté serveur)
interface PieceZip {
  dossier: string
  nom: string
  genre: string
  document_projet_id: string | null
}

interface ProjectDocumentExportItem {
  id: string
  file_name: string
  type: string
  pdf_preview_url: string | null
}

interface MemoireExportInfo {
  version: number
  generated_at: string
  sections_count: number
  estimated_pages: number
  passages_a_completer: number
}

interface DpgfExportInfo {
  file_name: string
  file_id: string
}

interface DpgfVerification {
  valid: boolean
  warnings: string[]
  total_ht: number | null
  nb_lignes: number
  nb_lignes_remplies: number
  nb_lignes_vides: number
}

interface DpgfRemplieInfo {
  file_name: string | null
  verification: DpgfVerification | null
}

interface ExportDetail {
  compliance_total: number
  compliance_confirmed: number
  compliance_with_source: number
  checklist_total: number
  checklist_present: number
  has_memoire: boolean
  has_dpgf: boolean
  compliance_items: ExigenceExport[]
  checklist_items: ChecklistExportItem[]
  project_documents: ProjectDocumentExportItem[]
  pieces_zip: PieceZip[]
  memoire_info: MemoireExportInfo | null
  dpgf_info: DpgfExportInfo | null
  dpgf_remplie: DpgfRemplieInfo | null
  naming_convention: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Pièces : vert = jointe (fait vérifié), ambre = à renouveler ou à confirmer,
// cercle neutre = à joindre (un travail à faire, pas une alarme).
function PieceIcon({ ton }: { ton: 'ok' | 'attention' | 'neutre' }) {
  if (ton === 'ok') return <CheckCircle2 size={15} className="shrink-0" style={{ color: 'var(--success-fg)' }} />
  if (ton === 'attention') return <AlertTriangle size={15} className="shrink-0" style={{ color: 'var(--warning-fg)' }} />
  return <Circle size={15} className="shrink-0" style={{ color: 'var(--text-3)' }} />
}

const DOSSIERS_ZIP: Record<string, string> = {
  '01_Candidature': 'Candidature',
  '02_Offre': 'Offre',
  '3_ANNEXES': 'Annexes',
}

// Un bloc de l'étape : une carte sur toute la largeur de sa section.
function Carte({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-carte border border-bord-2 bg-surface-1 p-4 ${className}`}>{children}</div>
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepExport({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dpgfUploading, setDpgfUploading] = useState(false)
  const [dpgfDragging, setDpgfDragging] = useState(false)
  const [dpgfError, setDpgfError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['export-detail', project.id],
    queryFn: async () => {
      const { data } = await api.get<ExportDetail>(`/projects/${project.id}/export/detail`)
      return data
    },
  })

  // Gate ZIP (C10) — score de conformité : X < Y → export ambre non-bloquant
  const { data: score } = useQuery<{ conformes: number; total: number }>({
    queryKey: ['checklist-score', project.id],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${project.id}/checklist/score`)
      return data
    },
  })
  // 1.16 — un livrable qui ne se télécharge pas : on le dit, avec « Réessayer »
  const [echec, setEchec] = useState<{ message: string; relancer: () => void } | null>(null)
  // Avertissements du dernier ZIP (pièces écartées, livrables à finaliser)
  const [avertissementsZip, setAvertissementsZip] = useState<string[] | null>(null)

  // Export « 0/N » (décision du 25/10) : l'utilisateur confirme les exigences,
  // une à une ou par groupe ; Synorix ne pose jamais « confirmée » tout seul.
  const { mutate: confirmer, isPending: confirmationEnCours } = useMutation({
    mutationFn: async (action: { item: ExigenceExport; confirmee: boolean } | { groupe: GroupeExigences }) => {
      if ('groupe' in action) {
        await api.post(`/projects/${project.id}/compliance/confirmer-groupe`, { groupe: action.groupe })
      } else {
        await api.patch(`/projects/${project.id}/compliance/${action.item.id}`, { confirmee: action.confirmee })
      }
    },
    onMutate: () => setEchec(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-detail', project.id] }),
    onError: async (err, action) => setEchec({
      message: await messageErreur(err, "La confirmation n'a pas été enregistrée."),
      relancer: () => confirmer(action),
    }),
  })

  const { mutate: exportDocx, isPending: isExportingDocx } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/export/docx`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Memoire_Technique_${project.name.replace(/\s+/g, '_')}.docx`
      a.click()
      URL.revokeObjectURL(url)
    },
    onMutate: () => setEchec(null),
    onError: async (err) => setEchec({
      message: await messageErreur(err, "Le téléchargement du mémoire Word n'a pas abouti."),
      relancer: () => exportDocx(),
    }),
  })

  // C13a — PDF fidèle : la version dépôt (le Word reste pour la retouche)
  const { mutate: exportPdf, isPending: isExportingPdf } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/memoire/export-pdf`, {
        responseType: 'blob', timeout: 180_000,
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Memoire_Technique_${project.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
    onMutate: () => setEchec(null),
    onError: async (err) => setEchec({
      message: await messageErreur(err, "Le téléchargement du mémoire PDF n'a pas abouti."),
      relancer: () => exportPdf(),
    }),
  })

  const { mutate: exportZip, isPending: isExportingZip } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/export/zip`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Dossier_AO_${project.name.replace(/\s+/g, '_')}.zip`
      a.click()
      URL.revokeObjectURL(url)
      // Pièces écartées et points signalés par le serveur (X-Export-Warnings)
      setAvertissementsZip(lireAvertissementsExport(response.headers['x-export-warnings']))
    },
    onMutate: () => { setEchec(null); setAvertissementsZip(null) },
    onError: async (err) => setEchec({
      message: await messageErreur(err, "Le téléchargement du dossier ZIP n'a pas abouti."),
      relancer: () => exportZip(),
    }),
  })

  // ── DPGF download ────────────────────────────────────────────────────────
  const handleDownloadDpgf = useCallback(async () => {
    if (!detail?.dpgf_info) return
    setEchec(null)
    try {
      const response = await api.get(
        `/projects/${project.id}/documents/${detail.dpgf_info.file_id}/download`,
        { responseType: 'blob' },
      )
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = detail.dpgf_info.file_name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setEchec({
        message: await messageErreur(err, `Le téléchargement du ${developper('DPGF')} n'a pas abouti.`),
        relancer: () => { void handleDownloadDpgf() },
      })
    }
  }, [project.id, detail?.dpgf_info])

  // ── DPGF filled upload ───────────────────────────────────────────────────
  const handleDpgfUpload = useCallback(async (file: File) => {
    setDpgfUploading(true)
    setDpgfError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/projects/${project.id}/dpgf-upload`, fd)
      queryClient.invalidateQueries({ queryKey: ['export-detail', project.id] })
    } catch {
      setDpgfError(`L'envoi du ${developper('DPGF')} n'a pas abouti.`)
    } finally {
      setDpgfUploading(false)
    }
  }, [project.id, queryClient])

  const onDpgfDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDpgfDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleDpgfUpload(file)
  }, [handleDpgfUpload])

  // ── Viewable documents for the DocumentViewer ────────────────────────────
  const viewableDocs: ViewableDocument[] = useMemo(() => {
    if (!detail) return []
    // Formulaires remplis du ZIP : documents du projet, ouvrables dans la visionneuse
    return detail.pieces_zip.flatMap((d) => (d.document_projet_id
      ? [{ id: d.document_projet_id, name: d.nom, source: 'project' as const }]
      : []))
  }, [detail])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading || !detail) {
    return (
      <div className="space-y-3">
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
      </div>
    )
  }

  // ── Computed values ───────────────────────────────────────────────────────
  // Export « 0/N » (décision du 25/10) : les exigences ne sont plus un point de
  // contrôle « couvert / non couvert » — Synorix les relève avec leur source,
  // l'utilisateur les confirme s'il le souhaite.
  const resumeDesExigences = resumeExigences(
    detail.compliance_total, detail.compliance_with_source, detail.compliance_confirmed)
  // Pièces : mêmes lignes et même règle que le score du serveur (avant : toutes
  // les lignes, dont le jalon « mémoire » jamais « présent », d'où un point
  // de contrôle en défaut pour toujours).
  const echeance = echeanceAO(project)?.date?.slice(0, 10) ?? null
  const piecesDemandees = lignesDuScore(detail.checklist_items)
  const checklistOk = !!score && score.total > 0 && score.conformes === score.total
  const memoireOk = detail.has_memoire
  const dpgfOk = detail.has_dpgf && (detail.dpgf_remplie?.verification?.valid ?? false)

  const alertCount =
    (checklistOk ? 0 : 1) +
    (memoireOk ? 0 : 1) +
    (dpgfOk ? 0 : 1)

  // ── Gate ZIP (C10) : X < Y pièces conformes → ambre + avertissement ──────
  const gateBlocked = !!score && score.total > 0 && score.conformes < score.total
  const CONFORME_STATUSES = new Set(['present', 'expiration_proche', 'non_applicable'])
  // Signature : règle serveur (signature_required) — DC1, DC2, DUME et AE
  // seulement si le RC l'exige ; plus de liste de types « à signer » ici.
  // Mêmes lignes que le score du serveur : pièces à fournir et à compléter.
  // Une pièce facultative n'est pas comptée : même nombre que les cartes de l'écran Pièces (14, pas 15 avec la facultative).
  const nonConformes = lignesDuScore(detail?.checklist_items ?? []).filter((i) =>
    i.status !== 'non_applicable' && (!CONFORME_STATUSES.has(i.status) || signatureAConfirmer(i)) && pieceDemandee(i, echeance),
  )

  // ── Faits du héros : l'état du dossier en un chiffre ─────────────────────
  const lotName = project.selected_lot_name || ''
  const readyForDeposit = !gateBlocked && alertCount === 0

  // L'action principale, écrite une fois : en haut à droite sur ordinateur, dans la barre au téléphone (une seule en dégradé par écran).
  const boutonTelecharger = (
    <button
        onClick={() => exportZip()}
        disabled={isExportingZip}
        className="signature-btn cta-grand disabled:opacity-40 max-[768px]:flex-1 max-[768px]:justify-center max-[768px]:whitespace-nowrap [@media(pointer:coarse)]:min-h-11"
        style={{ fontFamily: F }}
      >
        {isExportingZip ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Archive size={18} aria-hidden />}
        <span className="max-[768px]:hidden">Télécharger le dossier</span>
        <span className="hidden max-[768px]:inline">Télécharger</span>
      </button>
  )

  // ── Formats du mémoire : deux boutons visibles sur ordinateur (G10) ; au téléphone, le menu « … » de la barre.
  const sortieMemoire = (libelle: string, enCours: boolean, lancer: () => void, fermer?: () => void) => (
    <button
      key={libelle}
      type="button"
      role={fermer ? 'menuitem' : undefined}
      onClick={() => { fermer?.(); lancer() }}
      disabled={enCours || !detail.has_memoire}
      className={fermer
        ? 'flex min-h-9 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-fg hover:bg-surface-0 disabled:opacity-40 [@media(pointer:coarse)]:min-h-11'
        : 'inline-flex items-center gap-2 rounded-lg border border-bord-2 px-3.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-0 disabled:opacity-40'}
    >
      {enCours ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileDown size={14} aria-hidden />}
      {libelle}
    </button>
  )
  const formatsMemoire = (fermer?: () => void) => (
    <>
      {sortieMemoire('Mémoire en Word', isExportingDocx, exportDocx, fermer)}
      {sortieMemoire('Mémoire en PDF', isExportingPdf, exportPdf, fermer)}
    </>
  )

  // ── Barre du bas : l'état du dossier, les deux formats du mémoire (Word, PDF) ; le bouton principal n'y figure qu'au téléphone
  // (l'en-tête porte le sien sur ordinateur) : jamais deux boutons en dégradé visibles ensemble.
  const bottomBar = (
    <BarreEtape className="justify-between gap-3">
      <BilanBarre
        bureau={<p role="status" className="text-sm text-fg-2">{ligneEtatDossier(gateBlocked ? nonConformes.length : 0, alertCount, readyForDeposit)}</p>}
      />
      <div className="flex shrink-0 items-center gap-3 max-[768px]:ml-auto">
        <div className="flex items-center gap-3 max-[768px]:hidden">{formatsMemoire()}</div>
        <MenuPlus libelle="Autres formats">{(fermer) => formatsMemoire(fermer)}</MenuPlus>
        <ActionsBarreTel className="max-[768px]:flex-1">{boutonTelecharger}</ActionsBarreTel>
      </div>
    </BarreEtape>
  )

  // L'avertissement des pièces à joindre, UNE ligne au-dessus du bouton principal (décision du 1/11) : sur ordinateur dans
  // l'en-tête, juste au-dessus du bouton ; au téléphone au-dessus de la barre d'une seule ligne.
  const avertissementTel = gateBlocked ? (
    <div className="mt-6 hidden max-[768px]:block">
      <PiecesAJoindre pieces={nonConformes} />
    </div>
  ) : null

  const piecesVisibles = piecesDemandees.filter((p) => p.status !== 'non_applicable')
  const mem = detail.memoire_info

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: F }}>
    <GabaritEtape
      titre="Export du dossier"
      utilite={`Vérifiez l’état du dossier, puis téléchargez-le : pièces, mémoire et tableau des prix rangés dans l’ordre du règlement.${lotName ? ` — ${lotName}` : ''}`}
      actionPrincipale={
        <div className="flex flex-col items-end gap-2 max-[768px]:items-stretch">
          {gateBlocked && <PiecesAJoindre pieces={nonConformes} />}
          {boutonTelecharger}
        </div>
      }
      resume={<BandeResume libelle="L’état du dossier" cartes={[
        ...cartesPieces(piecesVisibles, echeance),
        { libelle: 'Mémoire technique', valeur: mem ? `${mem.estimated_pages} pages` : 'À rédiger', etat: memoireOk && !(mem && mem.passages_a_completer > 0) ? 'pret' : 'a-verifier',
          detail: (mem && libellePassagesACompleter(mem.passages_a_completer)) || (mem ? `Version ${mem.version}` : undefined) },
      ]} />}
      barre={bottomBar}
    >
    <div className="space-y-4">
      {detail.naming_convention && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Pièces du ZIP nommées selon le <Sigle code="RC" />&nbsp;:{' '}
          <span className="num-mono" style={{ color: 'var(--text-3)' }}>
            {detail.naming_convention.replace('{lot}', 'Lot').replace('{entreprise}', 'Entreprise').replace('{piece}', 'Pièce')}
          </span>
        </p>
      )}

      {echec && (
        <EchecAction
          message={echec.message}
          onReessayer={() => { const relancer = echec.relancer; setEchec(null); relancer() }}
          onFermer={() => setEchec(null)}
        />
      )}

      {avertissementsZip && avertissementsZip.length > 0 && (
        <div className="glass-card rounded-lg px-4 py-3" role="status">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            Dossier téléchargé — à noter avant le dépôt
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
            {avertissementsZip.map((a) => <li key={a}>• {a}</li>)}
          </ul>
          <button
            type="button"
            onClick={() => setAvertissementsZip(null)}
            className="mt-2 text-xs hover:underline"
            style={{ color: 'var(--text-3)' }}
          >
            Fermer
          </button>
        </div>
      )}

      {/* ── Pièces demandées : mêmes lignes et même règle que le résumé ── */}
      <SectionEtape titre="PIÈCES DEMANDÉES" colonnes={2}
        description={piecesVisibles.length === 0 ? undefined : 'Une pièce prête part dans le dossier ; une pièce à joindre, à renouveler ou à confirmer reste à traiter avant le dépôt.'}>
        {piecesVisibles.map((item) => {
          const etat = etatPiece(item, echeance)
          return (
            <Carte key={item.id} className="flex items-start gap-2.5">
              <PieceIcon ton={etat.ton} />
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-fg">{item.details || item.document_type_required}</p>
                <span className={etat.statut.classe}>{etat.texte}</span>
                {noteDepot(item) && <p className="piece-note">{noteDepot(item)}</p>}
                {phraseSourceSignature(item) && <p className="piece-note">{phraseSourceSignature(item)}</p>}
              </div>
            </Carte>
          )
        })}
        {piecesVisibles.length === 0 && (
          <p className="text-sm text-fg-3 md:col-span-2">La liste des pièces apparaît après la lecture du <Sigle code="RC" />.</p>
        )}
      </SectionEtape>

      {/* ── Mémoire technique ── */}
      <SectionEtape titre="MÉMOIRE TECHNIQUE">
        <Carte>
          {mem ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">Mémoire technique v{mem.version}</p>
                <p className="mt-0.5 text-sm text-fg-2">
                  {mem.estimated_pages} pages, {mem.sections_count} sections — généré le {jourCourtParis(mem.generated_at)}
                </p>
                <EtatElement
                  etat={libellePassagesACompleter(mem.passages_a_completer) ? 'a-verifier' : 'pret'} className="mt-1.5"
                />
                {libellePassagesACompleter(mem.passages_a_completer) && (
                  <p className="mt-1 text-sm text-fg-2">{libellePassagesACompleter(mem.passages_a_completer)}</p>
                )}
                <p className="mt-1 text-sm text-fg-3">Les documents de réponse sont inclus dans le dossier.</p>
              </div>
              <button
                onClick={() => navigate(`/projects/${project.id}/memoire`)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-bord-2 px-3 text-sm font-medium text-fg-2 hover:bg-surface-0 [@media(pointer:coarse)]:min-h-11"
              >
                <ExternalLink size={13} aria-hidden /> Voir le mémoire
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-fg-2">Le mémoire technique n’a pas encore été rédigé.</p>
                <EtatElement etat="a-verifier" className="mt-1.5" />
              </div>
              <button
                onClick={() => navigate(`/projects/${project.id}/plan`)}
                className="inline-flex min-h-9 items-center rounded-lg border border-bord-2 px-3 text-sm font-medium text-fg-2 hover:bg-surface-0 [@media(pointer:coarse)]:min-h-11"
              >
                Aller au plan du mémoire
              </button>
            </div>
          )}
        </Carte>
      </SectionEtape>

      {/* ── Tableau des prix : vérification de forme seulement ── */}
      <SectionEtape titre="TABLEAU DES PRIX">
        <Carte className="space-y-3.5">
          <EtatElement etat={dpgfOk || !detail.has_dpgf ? 'pret' : 'a-verifier'} />
              {/* Download original DPGF */}
              {detail.dpgf_info && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'var(--surface-1)' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet size={16} style={{ color: 'var(--text-1)' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{detail.dpgf_info.file_name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}><Sigle code="DPGF" majuscule /> d&apos;origine, dans le <Sigle code="DCE" /></p>
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadDpgf}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 hover:bg-ds-bg-2"
                    style={{ border: '1px solid var(--border-1)', color: 'var(--text-2)' }}
                  >
                    <Download size={13} /> Télécharger
                  </button>
                </div>
              )}

              {/* Upload filled DPGF */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                  Déposer votre <Sigle code="DPGF" /> remplie
                </p>
                <div
                  className="relative rounded-xl p-4 text-center transition-all cursor-pointer"
                  style={{
                    border: `2px dashed ${dpgfDragging ? 'var(--text-1)' : 'var(--text-3)'}`,
                    background: dpgfDragging ? 'color-mix(in srgb, var(--text-1) 4%, transparent)' : 'var(--surface-0)',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDpgfDragging(true) }}
                  onDragLeave={() => setDpgfDragging(false)}
                  onDrop={onDpgfDrop}
                >
                  {dpgfUploading ? (
                    <Loader2 size={20} className="mx-auto animate-spin" style={{ color: 'var(--text-1)' }} />
                  ) : (
                    <>
                      <Upload size={20} className="mx-auto mb-1.5" style={{ color: 'var(--text-3)' }} />
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        Glissez votre <Sigle code="DPGF" /> remplie ici ou{' '}
                        <label className="cursor-pointer font-medium" style={{ color: 'var(--text-1)' }}>
                          parcourir
                          <input
                            type="file"
                            accept=".xlsx,.xls,.xlsm,.ods,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleDpgfUpload(f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>XLSX, XLS, ODS, PDF</p>
                    </>
                  )}
                </div>
                {dpgfError && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--danger-fg)' }}>{dpgfError}</p>
                )}
              </div>

              {/* Verification result */}
              {detail.dpgf_remplie?.verification && (() => {
                const v = detail.dpgf_remplie!.verification!
                const isValid = v.valid
                const hasWarnings = v.warnings.length > 0
                return (
                  <div
                    className="rounded-lg p-3.5"
                    style={{
                      background: isValid ? 'color-mix(in srgb, var(--success-fg) 4%, transparent)' : hasWarnings ? 'color-mix(in srgb, var(--warning-fg) 4%, transparent)' : 'color-mix(in srgb, var(--danger-fg) 4%, transparent)',
                      border: `1px solid ${isValid ? 'color-mix(in srgb, var(--success-fg) 15%, transparent)' : hasWarnings ? 'color-mix(in srgb, var(--warning-fg) 15%, transparent)' : 'color-mix(in srgb, var(--danger-fg) 15%, transparent)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isValid
                          ? <CheckCircle2 size={16} style={{ color: 'var(--success-fg)' }} />
                          : <AlertTriangle size={16} style={{ color: hasWarnings ? 'var(--warning-fg)' : 'var(--danger-fg)' }} />
                        }
                        <span
                          className="text-xs font-semibold"
                          style={{ color: isValid ? 'var(--success-fg)' : hasWarnings ? 'var(--warning-fg)' : 'var(--danger-fg)' }}
                        >
                          <Sigle code="DPGF" majuscule />{isValid ? ' conforme' : hasWarnings ? ' avec avertissements' : ' non conforme'}
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {detail.dpgf_remplie!.file_name}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center py-1.5 rounded-lg" style={{ background: 'var(--surface-1)' }}>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{v.nb_lignes}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>lignes</p>
                      </div>
                      <div className="text-center py-1.5 rounded-lg" style={{ background: 'var(--surface-1)' }}>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{v.nb_lignes_remplies}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>remplies</p>
                      </div>
                      <div className="text-center py-1.5 rounded-lg" style={{ background: 'var(--surface-1)' }}>
                        <p className="text-sm font-bold" style={{ color: v.nb_lignes_vides > 0 ? 'var(--danger-fg)' : 'var(--text-1)' }}>{v.nb_lignes_vides}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>vides</p>
                      </div>
                    </div>

                    {v.total_ht != null && (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg mb-2" style={{ background: 'var(--surface-1)' }}>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>Total HT</span>
                        <span className="text-sm font-bold tabular-nums font-mono" style={{ color: 'var(--text-1)' }}>
                          {v.total_ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    )}

                    {v.warnings.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {v.warnings.map((w, i) => (
                          <p key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-3)' }}>
                            <span className="shrink-0 mt-0.5">&#8226;</span>
                            {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {!detail.dpgf_info && !detail.dpgf_remplie && (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  Aucun fichier <Sigle code="DPGF" /> détecté dans les documents du projet.
                </p>
              )}
        </Carte>
      </SectionEtape>

      {/* ── Exigences relevées, confirmées par l'utilisateur (export « 0/N ») ── */}
      <SectionEtape titre="EXIGENCES RELEVÉES" description={resumeDesExigences}>
        <Carte className="max-h-[420px] overflow-y-auto">
              <ExigencesDuDossier
                items={detail.compliance_items}
                onConfirmer={(item, confirmee) => confirmer({ item, confirmee })}
                onConfirmerGroupe={(groupe) => confirmer({ groupe })}
                enCours={confirmationEnCours}
              />
        </Carte>
      </SectionEtape>

      {/* ── Contenu de l'archive : exactement ce qui part ── */}
      <SectionEtape titre={`CONTENU DE L’ARCHIVE (${detail.pieces_zip.length})`}>
        <Carte className="max-h-[360px] overflow-y-auto">
              {detail.pieces_zip.map((d) => {
                const indexApercu = viewableDocs.findIndex((v) => v.id === d.document_projet_id)
                return (
                  <div
                    key={`${d.dossier}/${d.nom}`}
                    className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-ds-bg-2 transition-colors"
                  >
                    <FileText size={15} className="shrink-0" style={{ color: 'var(--text-3)' }} />
                    <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text-1)' }}>
                      {d.nom}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>
                      {DOSSIERS_ZIP[d.dossier] ?? d.dossier}
                    </span>
                    {indexApercu >= 0 && (
                      <button
                        type="button"
                        onClick={() => setViewerIndex(indexApercu)}
                        className="flex items-center gap-1 text-xs shrink-0 hover:underline"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <Eye size={12} /> Aperçu
                      </button>
                    )}
                  </div>
                )
              })}
              {detail.pieces_zip.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text-3)' }}>
                  Les pièces apparaissent ici dès qu’elles sont jointes au dossier
                </p>
              )}
        </Carte>
      </SectionEtape>

      {/* ── Sticky bottom bar ───────────────────────────────────── */}
      {avertissementTel}
    </div>
    </GabaritEtape>

      {/* Document viewer modal */}
      {viewerIndex !== null && viewableDocs.length > 0 && (
        <DocumentViewer
          projectId={project.id}
          documents={viewableDocs}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}
