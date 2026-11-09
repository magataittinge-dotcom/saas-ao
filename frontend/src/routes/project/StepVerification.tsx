import { useCallback, useMemo, useRef, useState } from 'react'
import { Sigle } from '@/components/common/Sigle'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Lock, FileSpreadsheet, Download, Upload, Sparkles, RefreshCw } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import { ActionsBarre, BilanBarre, BoutonSuite } from '@/components/project/BarreEtape'
import { GabaritEtape, BandeResume, BarreEtape } from '@/components/etape'
import { Button } from '@/components/ui/button'
import { cartesPieces, comptesDetailles, phraseComptes } from '@/lib/resumePieces'
import VaultPickerModal from '@/components/project/VaultPickerModal'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import { piecesComptees } from '@/components/project/NonConcerne'
import { comptesPieces } from '@/lib/statutPiece'
import { echeanceAO } from '@/lib/echeance'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ChecklistItem, Document } from '@/types'
import EchecAction from '@/components/common/EchecAction'
import { messageErreur } from '@/lib/erreurs'
import { messageActualisation, type EtatActualisation } from '@/lib/actualisation'

const F = 'var(--font-ui)'

interface Props { project: Project }

export default function StepVerification({ project }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Ouvre le coffre-fort en conservant le chemin de retour vers CETTE étape.
  const openVaultPage = () =>
    navigate(`/vault?returnTo=${encodeURIComponent(location.pathname)}`)
  const completeStep = useCompleteStep(project.id)
  const isAlreadyDone = project.completed_steps?.['4'] === true

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist', project.id],
    queryFn: async () => {
      const { data } = await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)
      return data
    },
  })

  const [pickerItem, setPickerItem] = useState<ChecklistItem | null>(null)

  // « Voir dans le DCE » : le passage du RC d'où la signature (ou la condition) a été lue.
  // Le panneau est celui de l'analyse : il lit l'ancre de l'exigence d'origine côté serveur.
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const fermerSelection = useCallback(() => setSelection(null), [])
  const ouvrirSource = useCallback((item: ChecklistItem) => {
    if (!item.source_exigence_id) return
    setSelection({ type: 'exigence', id: item.source_exigence_id, titre: item.source_document ?? undefined })
  }, [])

  // Typologie 4 groupes (document_group) : à fournir / à compléter / produit
  // par Synorix / workflow dédié. Le score ne compte que fournir + completer.
  const groups = useMemo(() => {
    const g: Record<'fournir' | 'completer' | 'synorix' | 'workflow', ChecklistItem[]> = {
      fournir: [], completer: [], synorix: [], workflow: [],
    }
    for (const item of items) {
      const key = (item.document_group as keyof typeof g) in g ? (item.document_group as keyof typeof g) : 'fournir'
      g[key].push(item)
    }
    return g
  }, [items])

  const vaultItems = groups.fournir
  const templateItems = groups.completer

  // Complétion = pièces sous responsabilité de l'entreprise (fournir + completer),
  // hors « Non concerné » (comme le score du serveur).
  const scored = piecesComptees([...vaultItems, ...templateItems])
  // « Prêt » : fait vérifié par le serveur (plan du ZIP), comme à l'Export. Les pièces
  // « Si concerné », « Facultatif » et « Pour l'attribution » ne sont pas à joindre maintenant.
  const echeance = echeanceAO(project)?.date?.slice(0, 10) ?? null
  // UN SEUL calcul des comptes (résumé, barre du bas, liste) : prêtes + à joindre + à renouveler = pièces demandées au dépôt
  const comptes = comptesDetailles(scored, echeance)
  const { aJoindre, pretes } = comptesPieces(scored, echeance)
  const pct = comptes.total > 0 ? Math.round((comptes.pretes / comptes.total) * 100) : 0

  // ── Mutations ───────────────────────────────────────────────────
  // Rafraîchit la liste ET recalcule le score, sans quitter l'étape.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['checklist', project.id] })
    queryClient.invalidateQueries({ queryKey: ['checklist-score', project.id] })
  }

  // R18 — « Actualiser » dit ce qu'il a fait : en cours, à jour, ou combien de pièces au lieu de combien.
  const [actualisation, setActualisation] = useState<EtatActualisation | null>(null)
  const nombreDePieces = (liste: ChecklistItem[]): number => {
    const suivies = liste.filter((i) => ['fournir', 'completer'].includes(i.document_group ?? 'fournir'))
    const c = comptesPieces(piecesComptees(suivies), echeance)
    return c.aJoindre + c.pretes
  }
  const actualiser = async () => {
    const avant = aJoindre + pretes
    setActualisation({ etat: 'en_cours' })
    try {
      await api.post(`/projects/${project.id}/checklist/regenerate`)
      await refresh()
      const apres = nombreDePieces(queryClient.getQueryData<ChecklistItem[]>(['checklist', project.id]) ?? [])
      setActualisation({ etat: 'fait', avant, apres })
    } catch {
      setActualisation({ etat: 'echec' })
    }
  }

  const handleUploadCompleted = async (item: ChecklistItem, file: File) => {
    const form = new FormData()
    form.append('file', file)
    await api.post(
      `/projects/${project.id}/checklist/${item.id}/upload-completed`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    await refresh()
  }

  const handleLinkVaultDoc = async (doc: Document) => {
    if (!pickerItem) return
    await api.put(
      `/projects/${project.id}/checklist/${pickerItem.id}/link`,
      { document_id: doc.id },
    )
    await refresh()
  }

  // « Choisir » → téléverser un NOUVEAU fichier pour cette pièce : on l'ajoute
  // au coffre-fort (avec le type de la pièce) puis on le rattache à l'exigence.
  const handleUploadNewVaultDoc = async (file: File) => {
    if (!pickerItem) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', pickerItem.document_type_required || 'autre')
    const { data: doc } = await api.post<Document>('/documents', fd)
    await api.put(
      `/projects/${project.id}/checklist/${pickerItem.id}/link`,
      { document_id: doc.id },
    )
    await refresh()
  }

  // Confirmation de signature — seulement pour les pièces où le serveur la
  // demande (signature_required : RC qui l'exige, déclaration sur l'honneur).
  const handleToggleSignature = async (item: ChecklistItem, confirmed: boolean) => {
    await api.patch(`/projects/${project.id}/checklist/${item.id}`, {
      signature_confirmed: confirmed,
    })
    await refresh()
  }

  // « Non concerné » / « Je suis concerné » — persisté, journalisé, réversible
  const handleNonConcerne = async (item: ChecklistItem, nonConcerne: boolean) => {
    await api.post(`/projects/${project.id}/checklist/${item.id}/non-concerne`, {
      non_concerne: nonConcerne,
    })
    await refresh()
  }

  // ── Workflow DPGF/BPU (C12) — SUR la pièce, pas de saut vers Export ──
  const DPGF_FILENAME: Record<string, string> = {
    dpgf_template: 'DPGF.xlsx', bpu_template: 'BPU.xlsx', dqe_template: 'DQE.xlsx',
  }
  const handleDownloadTemplate = async (item: ChecklistItem) => {
    if (!item.template_project_doc_id) return
    const res = await api.get(
      `/projects/${project.id}/documents/${item.template_project_doc_id}/download`,
      { responseType: 'blob' },
    )
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = DPGF_FILENAME[item.document_type_required] || 'bordereau.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  }
  // Ré-import de la version remplie → contrôle formel dpgf_checker → ✓/⚠️.
  const handleUploadDpgf = async (item: ChecklistItem, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    await api.post(`/projects/${project.id}/checklist/${item.id}/upload-completed`, fd)
    await refresh()
  }

  // ── Loading / empty ─────────────────────────────────────────────

  if (isLoading) return (
    <div style={{ fontFamily: F }}>
      <p className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-3)' }}>
        <Loader2 size={15} className="animate-spin" style={{ color: 'var(--text-1)' }} />
        Préparation de votre checklist…
      </p>
      <RequirementListSkeleton count={5} />
    </div>
  )

  // La checklist est matérialisée AUTOMATIQUEMENT (fin d'analyse + filet
  // paresseux côté serveur) : plus aucun bouton manuel. Un état vide ici
  // signifie que le DCE n'est pas encore analysé.
  if (items.length === 0) return (
    <div
      className="glass-card rounded-lg p-12 text-center"
      style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)', fontFamily: F }}
    >
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        La checklist des pièces apparaîtra automatiquement une fois le <Sigle code="DCE" /> analysé.
      </p>
    </div>
  )

  // ── Barre du bas (composant commun : une ligne au téléphone) ──────

  const bottomBar = (
    <BarreEtape className="flex-wrap gap-x-4 gap-y-2">
      <BilanBarre
        className="gap-3"
        bureau={<>
          <div role="progressbar" aria-label="Pièces prêtes" aria-valuemin={0} aria-valuemax={comptes.total} aria-valuenow={comptes.pretes} className="h-1 w-[120px] shrink-0 overflow-hidden rounded-pilule bg-surface-2">
            <div className="h-full rounded-pilule bg-accent-ui transition-[width] duration-morph ease-lien motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-fg-2">{phraseComptes(comptes)}</span>
        </>}
        tel={<>
          <div role="progressbar" aria-label="Pièces prêtes" aria-valuemin={0} aria-valuemax={comptes.total} aria-valuenow={comptes.pretes} className="h-1 min-w-0 flex-1 overflow-hidden rounded-pilule bg-surface-2">
            <div className="h-full rounded-pilule bg-accent-ui" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs text-fg-2">{comptes.pretes} sur {comptes.total}</span>
        </>}
      />
      <ActionsBarre>
        <BoutonSuite
          etape="Plan"
          onClick={() =>
            isAlreadyDone
              ? navigate(`/projects/${project.id}/plan`)
              : completeStep.mutate(4, {
                  onSuccess: () => navigate(`/projects/${project.id}/plan`),
                })
          }
          enCours={completeStep.isPending}
          enCoursLibelle="Validation..."
        />
      </ActionsBarre>
    </BarreEtape>
  )

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div
      className={selection ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : undefined}
      style={{ fontFamily: F }}
    >
    <div className="min-w-0">
    <GabaritEtape
      titre="Pièces de la candidature"
      utilite="Ce que le règlement demande : les pièces de votre coffre-fort et les formulaires de l’acheteur à compléter. Synorix les range dans le dossier de candidature."
      actionsSecondaires={<>
        {/* Régénération DISCRÈTE à la demande (ex. après ajout de pièces au coffre). */}
        <Button type="button" variant="outline" onClick={actualiser} disabled={actualisation?.etat === 'en_cours'} title="Recalculer la checklist depuis les exigences analysées">
          <RefreshCw size={14} className={actualisation?.etat === 'en_cours' ? 'animate-spin' : undefined} aria-hidden />
          Actualiser
        </Button>
        <span role="status" className="text-xs empty:hidden" style={{ color: 'var(--text-3)' }}>{messageActualisation(actualisation)}</span>
        <Button type="button" variant="outline" onClick={openVaultPage}>
          <Lock size={14} aria-hidden />
          Accéder au coffre-fort
        </Button>
      </>}
      resume={<BandeResume libelle="Les pièces du dossier" cartes={cartesPieces(scored, echeance, { coffre: piecesComptees(vaultItems), formulaires: piecesComptees(templateItems) })} />}
      barre={bottomBar}
    >
      <CandidatureSectionVault
        items={vaultItems}
        onPickFromVault={(item) => setPickerItem(item)}
        onOpenVault={openVaultPage}
        onToggleSignature={handleToggleSignature}
        onOpenSource={ouvrirSource}
        onNonConcerne={handleNonConcerne}
        echeance={echeance}
      />

      <CandidatureSectionTemplates
        projectId={project.id}
        items={templateItems}
        onUploadCompleted={handleUploadCompleted}
        onToggleSignature={handleToggleSignature}
        onOpenSource={ouvrirSource}
        onNonConcerne={handleNonConcerne}
        echeance={echeance}
      />

      <WorkflowSection
        items={groups.workflow}
        onDownload={handleDownloadTemplate}
        onUpload={handleUploadDpgf}
      />

      <SynorixJalonSection items={groups.synorix} />

      {pickerItem && (
        <VaultPickerModal
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onLink={handleLinkVaultDoc}
          onUploadNew={handleUploadNewVaultDoc}
        />
      )}

    </GabaritEtape>
    </div>
    {selection && (
      <PanneauSource
        key={selection.type === 'exigence' ? selection.id : 'champ'}
        selection={selection}
        onFermer={fermerSelection}
      />
    )}
    </div>
  )
}

// ── Workflow dédié (DPGF/BPU) — download → remplir → re-import SUR la pièce ────
// C12 : télécharger la trame du DCE, remplir hors ligne, ré-importer → contrôle
// formel dpgf_checker → ✓/⚠️. Tout se passe ICI, aucun saut vers Export.
function WorkflowSection({
  items, onDownload, onUpload,
}: {
  items: ChecklistItem[]
  onDownload: (item: ChecklistItem) => Promise<void>
  onUpload: (item: ChecklistItem, file: File) => Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <section
      className="glass-card rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)', fontFamily: F }}
    >
      <header className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-1)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--warning-fg) 10%, transparent)' }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--warning-fg)' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}><Sigle code="DPGF" majuscule /> et <Sigle code="BPU" /></h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
            Téléchargez la trame, remplissez-la puis ré-importez-la — contrôle automatique des lignes.
          </p>
        </div>
      </header>
      <ul>
        {items.map((i) => (
          <WorkflowRow key={i.id} item={i} onDownload={onDownload} onUpload={onUpload} />
        ))}
      </ul>
    </section>
  )
}

function WorkflowRow({
  item, onDownload, onUpload,
}: {
  item: ChecklistItem
  onDownload: (item: ChecklistItem) => Promise<void>
  onUpload: (item: ChecklistItem, file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'dl' | 'up' | null>(null)
  const done = item.status === 'present'
  const warn = item.status === 'warning'

  // 1.16 — un téléchargement ou un dépôt qui échoue est dit sur la ligne, avec « Réessayer »
  const [echec, setEchec] = useState<{ message: string; relancer: () => void } | null>(null)
  const run = async (kind: 'dl' | 'up', fn: () => Promise<void>, defaut: string) => {
    setBusy(kind)
    setEchec(null)
    try {
      await fn()
    } catch (err) {
      setEchec({ message: await messageErreur(err, defaut), relancer: () => { void run(kind, fn, defaut) } })
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="flex items-center gap-3 px-5 py-2.5 flex-wrap" style={{ borderTop: '1px solid var(--border-1)' }}>
      <FileSpreadsheet size={15} style={{ color: 'var(--warning-fg)' }} className="shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{item.details}</p>
        <span className="text-xs" style={{ color: done ? 'var(--success-fg)' : warn ? 'var(--warning-fg)' : 'var(--text-3)' }}>
          {done ? '✓ Rempli et vérifié' : warn ? '⚠️ À corriger (lignes sans prix)' : 'À remplir'}
        </span>
      </div>
      {item.lot && (
        <span className="text-xs px-1.5 rounded-full shrink-0" style={{ background: 'color-mix(in srgb, var(--text-1) 8%, transparent)', color: 'var(--text-2)' }}>
          {item.lot.replace(/^lot/i, 'Lot ')}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm,.ods,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void run('up', () => onUpload(item, f), "Le dépôt du bordereau rempli n'a pas abouti.")
          e.target.value = ''
        }}
      />
      {item.template_project_doc_id && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('dl', () => onDownload(item), "Le téléchargement de la trame n'a pas abouti.")}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-ds-bg-2 disabled:opacity-60"
          style={{ border: '1px solid var(--border-1)', color: 'var(--text-3)' }}
        >
          {busy === 'dl' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Télécharger la trame
        </button>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
        className="glass-btn shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
        style={{ color: 'var(--text-2)' }}
      >
        {busy === 'up' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {done || warn ? 'Remplacer' : 'Importer remplie'}
      </button>
      {echec && (
        <div className="basis-full">
          <EchecAction
            message={echec.message}
            onReessayer={() => { const relancer = echec.relancer; setEchec(null); relancer() }}
            onFermer={() => setEchec(null)}
          />
        </div>
      )}
    </li>
  )
}

// ── Produit par Synorix (mémoire technique) — jalon informatif, jamais upload ─
function SynorixJalonSection({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null
  return (
    <section
      className="glass-card rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)', fontFamily: F }}
    >
      <header className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-1)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--text-1) 8%, transparent)' }}>
          <Sparkles size={18} style={{ color: 'var(--text-1)' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>Généré par Synorix</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
            Produit automatiquement à l&apos;étape suivante — rien à joindre ici.
          </p>
        </div>
      </header>
      <ul>
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderTop: '1px solid var(--border-1)' }}>
            <Sparkles size={15} style={{ color: 'var(--text-1)' }} className="shrink-0" />
            <span className="text-sm flex-1 min-w-0" style={{ color: 'var(--text-2)' }}>{i.details}</span>
            {i.lot && (
              <span className="text-xs px-1.5 rounded-full shrink-0" style={{ background: 'color-mix(in srgb, var(--text-1) 8%, transparent)', color: 'var(--text-2)' }}>
                {i.lot.replace(/^lot/i, 'Lot ')}
              </span>
            )}
            <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>Étape Mémoire</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

