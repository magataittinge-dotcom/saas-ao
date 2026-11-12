import { useState, useCallback, useMemo, useRef } from 'react'
import { heureParis, jourCourtParis, jourLongParis } from '@/lib/dateParis'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Archive, Download, FileDown } from 'lucide-react'
import { api } from '@/services/api'
import { verrouLancement } from '@/lib/verrouLancement'
import type { Project } from '@/types'
import DocumentViewer, { type ViewableDocument } from '@/components/project/DocumentViewer'
import EchecAction from '@/components/common/EchecAction'
import { MettreAJourStatut } from '@/components/common/MettreAJourStatut'
import { phraseSourceSignature, signatureAConfirmer } from '@/components/project/SignatureLigne'
import { GabaritEtape, BandeResume, BarreEtape, BilanBarre, ActionsBarreTel, SectionEtape, EtatElement, AnalyseNonFaite, SqueletteCorpsEtape } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { EtatErreur } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
import { cartesPieces, etatDeStatut } from '@/lib/resumePieces'
import ExigencesDuDossier, { type ExigenceExport } from '@/components/project/ExigencesDuDossier'
import {
  etatPiece, ligneEtatDossier, lignesDuScore, lireAvertissementsExport, phraseDepot, phrasePiecesAJoindre, pieceDemandee, resumeExigences, type GroupeExigences,
} from '@/lib/exportDossier'
import { messageErreur } from '@/lib/erreurs'
import { Sigle } from '@/components/common/Sigle'
import { developper } from '@/lib/lexique'
import { noteDepot } from '@/lib/statutPiece'
import { libellePassagesACompleter } from '@/lib/passagesACompleter'
import { echeanceAO, etatEcheance, type EcheanceSource } from '@/lib/echeance'
import { useMedia } from '@/hooks/useMedia'
import { cn } from '@/lib/utils'
import { dossierLu } from '@/lib/dossierLu'

const TITRE = 'Export du dossier'
const UTILITE = 'Le dossier de réponse, rangé dans l’ordre du règlement.'
/** Où un geste a échoué : le message se pose là, à côté de son bouton (jury, tour 1). */
type Lieu = 'dossier' | 'formats' | 'prix' | 'exigences'
const ACCEPT_DPGF = '.xlsx,.xls,.xlsm,.ods,.pdf'

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

// ─── Ce qui entoure le téléchargement ───────────────────────────────────────

const DOSSIERS_ZIP: Record<string, string> = {
  '01_Candidature': 'Candidature',
  '02_Offre': 'Offre',
  '3_ANNEXES': 'Annexes',
}

/** La date de remise, pour la phrase du dépôt (A12) : « 12 novembre », « 14 h » ou « 14 h 30 », et si elle est passée. */
export function remiseDe(source: EcheanceSource | null, maintenant: Date = new Date()): { jour: string; heure: string | null; passee: boolean } | null {
  if (!source?.date) return null
  const e = etatEcheance(source, maintenant)
  const [h, m] = source.heure && e.limite ? heureParis(e.limite).split(':') : []
  return { jour: jourLongParis(source.date), heure: h ? `${Number(h)} h${m && m !== '00' ? ` ${m}` : ''}` : null, passee: e.etat === 'passee' }
}

/**
 * B1 — après le téléchargement du dossier, et seulement après : le dossier est sur l'ordinateur, il reste à le déposer
 * (hors Synorix), puis à le dire ici. « Je l'ai déposé » ouvre le dialogue de statut du socle (PATCH /projects/{id}).
 */
export function SuiteDepot({ telecharge, phrase, avertissements, onDepose }: {
  telecharge: boolean
  phrase: string
  /** Pièces écartées et points signalés par le serveur au dernier téléchargement. */
  avertissements: readonly string[]
  onDepose: () => void
}) {
  if (!telecharge) return null
  return (
    <Message ton="succes" titre="Dossier téléchargé" action={<Bouton variante="secondaire" onClick={onDepose}>Je l’ai déposé</Bouton>}>
      <p>{phrase}</p>
      {avertissements.length > 0 && (
        <ul className="mt-2 space-y-0.5" aria-label="À noter avant le dépôt">
          {avertissements.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
    </Message>
  )
}

/** Le nom d'une pièce, sans la note du logiciel (« (2 exigences du RC regroupées) », posée par le serveur). */
export const titrePiece = (item: { details: string | null; document_type_required: string }): string =>
  (item.details || item.document_type_required).replace(/\s*\(\d+ exigences du RC regroupées\)/g, '').trim()

// ─── Main component ─────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepExport({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dpgfUploading, setDpgfUploading] = useState(false)
  const [dpgfDragging, setDpgfDragging] = useState(false)
  const [dpgfError, setDpgfError] = useState<string | null>(null)
  // B1 — « Je l'ai déposé » n'apparaît qu'après un téléchargement réussi du dossier
  const [telecharge, setTelecharge] = useState(false)
  const [statutOuvert, setStatutOuvert] = useState(false)
  // Au téléphone, c'est la barre du bas qui porte « Télécharger » : l'en-tête ne monte pas le sien.
  const tel = useMedia('(max-width: 768px)')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const requeteDetail = useQuery({
    queryKey: ['export-detail', project.id],
    queryFn: async () => {
      const { data } = await api.get<ExportDetail>(`/projects/${project.id}/export/detail`)
      return data
    },
  })
  const { data: detail, isLoading } = requeteDetail

  // Gate ZIP (C10) — score de conformité : X < Y → export ambre non-bloquant
  const { data: score } = useQuery<{ conformes: number; total: number }>({
    queryKey: ['checklist-score', project.id],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${project.id}/checklist/score`)
      return data
    },
  })
  // 1.16 — un livrable qui ne se télécharge pas : on le dit, avec « Réessayer »
  const [echec, setEchec] = useState<{ lieu: Lieu; message: string; relancer: () => void } | null>(null)
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
      lieu: 'exigences', message: await messageErreur(err, "La confirmation n’a pas été enregistrée."),
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
      lieu: 'formats', message: await messageErreur(err, "Le mémoire en Word n’a pas pu être téléchargé."),
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
      lieu: 'formats', message: await messageErreur(err, "Le mémoire en PDF n’a pas pu être téléchargé."),
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
      setTelecharge(true)
    },
    onMutate: () => { setEchec(null); setAvertissementsZip(null) },
    onError: async (err) => setEchec({
      lieu: 'dossier', message: await messageErreur(err, "Le dossier n’a pas pu être téléchargé. Rien n’est perdu."),
      relancer: () => telechargerDossier(),
    }),
  })
  // Un seul dossier à la fois : un double clic ne télécharge pas deux dossiers (lib/verrouLancement).
  const verrouZip = useRef(verrouLancement()).current
  const telechargerDossier = () => {
    if (!verrouZip.prendre()) return
    exportZip(undefined, { onSettled: verrouZip.rendre })
  }

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
        lieu: 'prix', message: await messageErreur(err, 'Le tableau de l’acheteur n’a pas pu être téléchargé.'),
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
      setDpgfError(`L’envoi du ${developper('DPGF')} n’a pas abouti.`)
    } finally {
      setDpgfUploading(false)
    }
  }, [project.id, queryClient])

  // Le sélecteur de fichier du système d'exploitation, ouvert par un bouton du système (aucun champ de fichier dans la page).
  const choisirDpgf = () => {
    const champ = document.createElement('input')
    champ.type = 'file'
    champ.accept = ACCEPT_DPGF
    champ.onchange = () => { const f = champ.files?.[0]; if (f) void handleDpgfUpload(f) }
    champ.click()
  }

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

  // ── Chargement, puis erreur : le titre de l'étape reste ; une panne n'est jamais un squelette sans fin ──
  // Dossier non analysé (AO neuf) : rien n'est su. Synorix le dit une fois, avec l'action qui fait avancer ; ni case, ni
  // pastille, ni section vide (jury, tour 1 : « À joindre : Aucune » et « Prêt » sur un dossier que personne n'a lu).
  if (!dossierLu(project)) {
    return (
      <GabaritEtape titre={TITRE} utilite={UTILITE}>
        <AnalyseNonFaite project={project} viendra={['Les pièces demandées', 'Le mémoire technique', 'Le tableau des prix']} />
      </GabaritEtape>
    )
  }
  if (isLoading) {
    return (
      <GabaritEtape titre={TITRE} utilite={UTILITE}>
        <div role="status" aria-busy="true">
          <span className="sr-only">Chargement du dossier</span>
          <SqueletteCorpsEtape />
        </div>
      </GabaritEtape>
    )
  }
  if (requeteDetail.isError || !detail) {
    return (
      <GabaritEtape titre={TITRE} utilite={UTILITE}>
        <EtatErreur
          titre="Le dossier n’a pas pu s’ouvrir"
          detail="La connexion au serveur a échoué. Vos pièces et votre mémoire ne sont pas touchés."
          onReessayer={() => { void requeteDetail.refetch() }} enCours={requeteDetail.isFetching}
        />
      </GabaritEtape>
    )
  }

  // ── Computed values ───────────────────────────────────────────────────────
  // Export « 0/N » (décision du 25/10) : les exigences ne sont plus un point de
  // contrôle « couvert / non couvert » — Synorix les relève avec leur source,
  // l'utilisateur les confirme s'il le souhaite.
  const resumeDesExigences = resumeExigences(
    detail.compliance_total, detail.compliance_with_source, detail.compliance_confirmed)
  // Pièces : mêmes lignes et même règle que le score du serveur.
  const sourceEcheance = echeanceAO(project)
  const echeance = sourceEcheance?.date?.slice(0, 10) ?? null
  const piecesDemandees = lignesDuScore(detail.checklist_items)
  const checklistOk = !!score && score.total > 0 && score.conformes === score.total
  const memoireOk = detail.has_memoire
  const dpgfOk = detail.has_dpgf && (detail.dpgf_remplie?.verification?.valid ?? false)

  const alertCount =
    (checklistOk ? 0 : 1) +
    (memoireOk ? 0 : 1) +
    (dpgfOk ? 0 : 1)

  // ── Gate ZIP (C10) : X < Y pièces conformes → avertissement, sans bloquer ──────
  const gateBlocked = !!score && score.total > 0 && score.conformes < score.total
  const CONFORME_STATUSES = new Set(['present', 'expiration_proche', 'non_applicable'])
  // Signature : règle serveur (signature_required) — DC1, DC2, DUME et AE seulement si le RC l'exige.
  // Mêmes lignes que le score du serveur : pièces à fournir et à compléter. Une pièce facultative n'est pas comptée :
  // même nombre que les cartes de l'écran Pièces.
  const nonConformes = lignesDuScore(detail?.checklist_items ?? []).filter((i) =>
    i.status !== 'non_applicable' && (!CONFORME_STATUSES.has(i.status) || signatureAConfirmer(i)) && pieceDemandee(i, echeance),
  )

  const readyForDeposit = !gateBlocked && alertCount === 0
  const piecesVisibles = piecesDemandees.filter((p) => p.status !== 'non_applicable')
  // Les pièces, rangées sous leur état (dans l'ordre où les états apparaissent).
  const groupesPieces: { lu: ReturnType<typeof etatDeStatut>; pieces: typeof piecesVisibles }[] = []
  for (const piece of piecesVisibles) {
    const lu = etatDeStatut(etatPiece(piece, echeance).statut)
    const groupe = groupesPieces.find((g) => g.lu.etat === lu.etat && g.lu.texte === lu.texte)
    if (groupe) groupe.pieces.push(piece)
    else groupesPieces.push({ lu, pieces: [piece] })
  }
  const mem = detail.memoire_info
  // UNE phrase pour le mémoire, la même que sur Rédiger (lib/passagesACompleter.ts, compte du serveur)
  const passages = mem ? libellePassagesACompleter(mem.passages_a_completer) : null
  const depot = phraseDepot(remiseDe(sourceEcheance))
  // Rien à télécharger encore (AO neuf) : le bouton attend, il ne propose pas un dossier vide.
  const dossierVide = detail.pieces_zip.length === 0 && !detail.has_memoire

  // Aucune pièce n'est encore jointe : le dossier ne contiendrait que le mémoire. L'écran le dit, et son action devient
  // « Réunir les pièces » ; le téléchargement reste possible, au trait (jury, tour 1 : un aplat « Télécharger » sur un
  // dossier que l'écran déclarait lui-même sans pièce).
  const pretes = piecesVisibles.filter((p) => pieceDemandee(p, echeance) && !nonConformes.includes(p)).length
  const aucunePieceJointe = gateBlocked && nonConformes.length > 0 && pretes === 0
  const allerAuxPieces = () => navigate(`/projects/${project.id}/verification`)

  // Le téléchargement du dossier, écrit une fois : dans l'en-tête sur ordinateur, dans la barre du bas au téléphone. C'est
  // le seul bouton « Télécharger le dossier » de la page ; les autres disent ce qu'ils téléchargent.
  const boutonTelecharger = (
    <Bouton variante={aucunePieceJointe ? 'secondaire' : 'principal'} onClick={telechargerDossier} disabled={dossierVide} enCours={isExportingZip} libelleEnCours="Préparation du dossier…" className="max-[768px]:flex-1">
      <Archive aria-hidden />
      Télécharger le dossier
    </Bouton>
  )
  const boutonPieces = aucunePieceJointe
    ? <Bouton variante="principal" onClick={allerAuxPieces} className="max-[768px]:flex-1">Réunir les pièces</Bouton>
    : null

  // ── Les deux formats du mémoire : deux boutons visibles à côté du mémoire, à toutes les largeurs.
  const FORMATS = [
    { libelle: 'Mémoire en Word', enCours: isExportingDocx, lancer: () => exportDocx() },
    { libelle: 'Mémoire en PDF', enCours: isExportingPdf, lancer: () => exportPdf() },
  ]
  const formatsMemoire = () => FORMATS.map((f) => (
    <Bouton key={f.libelle} variante="secondaire" onClick={f.lancer} disabled={!detail.has_memoire} enCours={f.enCours} libelleEnCours="Préparation…">
      <FileDown aria-hidden /> {f.libelle}
    </Bouton>
  ))

  // ── Barre du bas : l'état du dossier ; au téléphone, l'action de l'écran (au pouce).
  const etatDossier = ligneEtatDossier(gateBlocked ? nonConformes.length : 0, alertCount, readyForDeposit)
  const bottomBar = (
    <BarreEtape className="justify-between gap-3">
      <BilanBarre bureau={<p role="status" className="text-sm text-fg-2">{etatDossier}</p>} />
      <ActionsBarreTel className="max-[768px]:flex-1">{tel ? <>{boutonTelecharger}{boutonPieces}</> : null}</ActionsBarreTel>
    </BarreEtape>
  )

  const phrasePieces = gateBlocked ? phrasePiecesAJoindre(nonConformes.length) : null
  // UN message à la fois sous l'en-tête, du plus pressant au moins pressant : le téléchargement qui n'a pas abouti, le
  // dossier qui se prépare, le dossier téléchargé, puis les pièces qui restent à joindre.
  const echecIci = (lieu: Lieu) => (echec && echec.lieu === lieu ? (
    <EchecAction
      message={echec.message}
      onReessayer={() => { const relancer = echec.relancer; setEchec(null); relancer() }}
      onFermer={() => setEchec(null)}
    />
  ) : null)
  const messageEnTete = echecIci('dossier') ?? (isExportingZip ? (
    <Message ton="info">
      Synorix rassemble vos pièces et met le mémoire en page. Comptez une vingtaine de secondes : le téléchargement démarre seul, vous pouvez rester sur cette page.
    </Message>
  ) : telecharge ? (
    <SuiteDepot telecharge={telecharge} phrase={depot} avertissements={avertissementsZip ?? []} onDepose={() => setStatutOuvert(true)} />
  ) : aucunePieceJointe ? (
    <Message ton="attention">
      Aucune pièce n’est encore jointe : pour l’instant, le dossier ne contient que {detail.has_memoire ? 'le mémoire technique' : 'ce que vous y déposerez'}. {phrasePieces}
    </Message>
  ) : phrasePieces ? (
    <Message ton="attention" action={<Bouton variante="secondaire" onClick={allerAuxPieces}>Réunir les pièces</Bouton>}>
      {phrasePieces}
    </Message>
  ) : null)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <GabaritEtape
        titre={TITRE}
        utilite={UTILITE}
        actionPrincipale={tel ? undefined : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {boutonTelecharger}
            {boutonPieces}
          </div>
        )}
        message={messageEnTete ?? undefined}
        resume={<BandeResume libelle="L’état du dossier" cartes={[
          // une case sans valeur ne dessine pas de jauge vide (« Prêtes : Aucune » le dit déjà)
          ...cartesPieces(piecesVisibles, echeance).map((c) => ({ ...c, rien: 'Aucune' as const, jauge: c.valeur === '0' ? undefined : c.jauge })),
          { libelle: 'Mémoire technique', valeur: mem ? `${mem.estimated_pages} pages` : 'À rédiger', etat: memoireOk && !passages ? 'pret' as const : 'a-verifier' as const,
            detail: passages || (mem ? `Version ${mem.version}` : undefined) },
        ]} />}
        barre={bottomBar}
      >
        {/* ── Pièces demandées : mêmes lignes et même règle que le résumé ── */}
        <SectionEtape titre="Pièces demandées"
          description={piecesVisibles.length === 0 ? undefined : 'Une pièce prête part dans le dossier ; une pièce à joindre, à renouveler ou à confirmer reste à traiter avant le dépôt.'}>
          {piecesVisibles.length === 0 ? (
            <p className="text-sm text-fg-2">La liste des pièces apparaît après l’analyse du <Sigle code="RC" />.</p>
          ) : (
            <Carte sansMarge>
              {/* Un état, dit une fois, puis ses pièces (jury, tour 1 : quatorze fois « À joindre » ne triait rien). */}
              <ul aria-label="Pièces demandées">
                {groupesPieces.map((g) => (
                  <li key={g.lu.texte ?? g.lu.etat} className="border-t border-bord first:border-t-0">
                    <p className="flex items-center gap-2 bg-surface-1 px-4 py-2 sm:px-5">
                      <EtatElement etat={g.lu.etat} texte={g.lu.texte} perimee={g.lu.perimee} />
                      <span className="text-xs text-fg-3">· {g.pieces.length}</span>
                    </p>
                    <ul>
                      {g.pieces.map((item) => (
                        <li key={item.id} className="min-h-11 border-t border-bord px-4 py-2.5 sm:px-5">
                          <p className="break-words text-sm font-medium text-fg">{titrePiece(item)}</p>
                          {noteDepot(item) && <p className="text-xs text-fg-3">{noteDepot(item)}</p>}
                          {phraseSourceSignature(item) && <p className="text-xs text-fg-3">{phraseSourceSignature(item)}</p>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Carte>
          )}
        </SectionEtape>

        {/* ── Mémoire technique ── */}
        <SectionEtape titre="Mémoire technique">
          {echecIci('formats')}
          <Carte className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            {mem ? (
              <>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-medium text-fg">Mémoire technique, version {mem.version}</p>
                  <p className="mt-0.5 text-sm text-fg-2">
                    {mem.estimated_pages} pages, {mem.sections_count} sections · rédigé le {jourCourtParis(mem.generated_at)}
                  </p>
                  <EtatElement etat={passages ? 'a-verifier' : 'pret'} texte={passages ?? undefined} className="mt-1.5" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {formatsMemoire()}
                  <Bouton variante="lien" className="px-2" onClick={() => navigate(`/projects/${project.id}/memoire`)}>Voir le mémoire</Bouton>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-medium text-fg">Le mémoire technique reste à rédiger</p>
                  <p className="mt-0.5 text-sm text-fg-2">Il se rédige à partir du plan, puis rejoint le dossier.</p>
                </div>
                <Bouton variante="secondaire" onClick={() => navigate(`/projects/${project.id}/plan`)}>Aller au plan du mémoire</Bouton>
              </>
            )}
          </Carte>
        </SectionEtape>

        {/* ── Tableau des prix : vérification de forme seulement ── */}
        <SectionEtape titre="Tableau des prix" description="Synorix vérifie la forme du tableau (lignes remplies, total lu). Il ne commente jamais vos prix.">
          {echecIci('prix')}
          <Carte sansMarge>
            {detail.dpgf_info && (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-medium text-fg">Le tableau de l’acheteur, à remplir</p>
                  <p className="break-words text-xs text-fg-3">{detail.dpgf_info.file_name}</p>
                  <p className="text-xs text-fg-3"><Sigle code="DPGF" majuscule /> d’origine, dans le <Sigle code="DCE" /></p>
                </div>
                <Bouton variante="secondaire" onClick={handleDownloadDpgf}>
                  <Download aria-hidden /> Télécharger le tableau de l’acheteur
                </Bouton>
              </div>
            )}
            <div
              data-depot-dpgf=""
              className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-bord px-4 py-3 transition-colors duration-fast ease-survol first:border-t-0 sm:px-5', dpgfDragging && 'bg-surface-1')}
              onDragOver={(e) => { e.preventDefault(); setDpgfDragging(true) }}
              onDragLeave={() => setDpgfDragging(false)}
              onDrop={onDpgfDrop}
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-medium text-fg">Votre <Sigle code="DPGF" /> remplie</p>
                <p className="text-xs text-fg-3">
                  {detail.dpgf_remplie?.file_name ?? 'Glissez le fichier ici, ou choisissez-le.'} · XLSX, XLS, ODS ou PDF
                </p>
                {dpgfError && <p role="alert" className="mt-1 text-xs font-medium text-rouge-ink">{dpgfError}</p>}
              </div>
              <Bouton variante="secondaire" onClick={choisirDpgf} enCours={dpgfUploading} libelleEnCours="Envoi…">
                {detail.dpgf_remplie?.file_name ? 'Remplacer le fichier' : 'Choisir un fichier'}
              </Bouton>
            </div>

            {detail.dpgf_remplie?.verification && (() => {
              const v = detail.dpgf_remplie!.verification!
              return (
                <div data-verification-dpgf="" className="space-y-2 border-t border-bord px-4 py-3 sm:px-5">
                  <PastilleEtat sens={v.valid ? 'vert' : 'ambre'}>{v.valid ? 'Forme vérifiée' : 'À vérifier'}</PastilleEtat>
                  {/* A11 — une ligne restée vide se dit « à remplir », à l'encre ambre : une friction, avec son geste */}
                  <p className="chiffres text-sm text-fg-2">
                    {v.nb_lignes} lignes · {v.nb_lignes_remplies} remplies
                    {v.nb_lignes_vides > 0 && <> · <span className="font-medium text-ambre-ink">{v.nb_lignes_vides} à remplir</span></>}
                    {v.total_ht != null && <> · total HT lu : <span className="font-medium text-fg">{v.total_ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span></>}
                  </p>
                  {v.warnings.length > 0 && (
                    <ul className="space-y-0.5 text-sm text-fg-2">
                      {v.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )
            })()}

            {!detail.dpgf_info && !detail.dpgf_remplie && (
              <p className="border-t border-bord px-4 py-3 text-sm text-fg-2 sm:px-5">
                Le dossier analysé ne contient pas de <Sigle code="DPGF" />&nbsp;: déposez la vôtre si le règlement en demande une.
              </p>
            )}
          </Carte>
        </SectionEtape>

        {/* ── Exigences relevées, confirmées par l'utilisateur (export « 0/N ») ── */}
        <SectionEtape titre="Exigences relevées" description={resumeDesExigences}>
          {echecIci('exigences')}
          <Carte sansMarge>
            <ExigencesDuDossier
              items={detail.compliance_items}
              onConfirmer={(item, confirmee) => confirmer({ item, confirmee })}
              onConfirmerGroupe={(groupe) => confirmer({ groupe })}
              enCours={confirmationEnCours}
            />
          </Carte>
        </SectionEtape>

        {/* ── Contenu du dossier : exactement ce qui part ── */}
        <SectionEtape
          titre="Contenu du dossier"
          description={detail.naming_convention
            ? <>Pièces nommées selon le <Sigle code="RC" />&nbsp;: {detail.naming_convention.replace('{lot}', 'Lot').replace('{entreprise}', 'Entreprise').replace('{piece}', 'Pièce')}</>
            : undefined}
        >
          {detail.pieces_zip.length === 0 ? (
            <p className="text-sm text-fg-2">Les pièces apparaissent ici dès qu’elles sont jointes au dossier.</p>
          ) : (
            <Carte sansMarge className="max-h-[360px] overflow-y-auto">
              <ul aria-label="Contenu du dossier">
                {detail.pieces_zip.map((d) => {
                  const indexApercu = viewableDocs.findIndex((v) => v.id === d.document_projet_id)
                  return (
                    <li key={`${d.dossier}/${d.nom}`} className="flex min-h-[52px] items-center gap-3 border-t border-bord px-4 py-1 first:border-t-0 sm:px-5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{d.nom}</span>
                      <span className="shrink-0 text-xs text-fg-3">{DOSSIERS_ZIP[d.dossier] ?? d.dossier}</span>
                      {indexApercu >= 0 && <Bouton variante="lien" onClick={() => setViewerIndex(indexApercu)}>Aperçu</Bouton>}
                    </li>
                  )
                })}
              </ul>
            </Carte>
          )}
        </SectionEtape>

        {/* A12 — la dernière étape se lit en fin de page, à toutes les largeurs (elle flottait sous le bouton de l'en-tête) */}
        <p data-phrase-depot="" className="text-sm text-fg-2">{depot}</p>
      </GabaritEtape>

      <MettreAJourStatut projet={project} ouvert={statutOuvert} onOuvert={setStatutOuvert} />

      {viewerIndex !== null && viewableDocs.length > 0 && (
        <DocumentViewer
          projectId={project.id}
          documents={viewableDocs}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  )
}
