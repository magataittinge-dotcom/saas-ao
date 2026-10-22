import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Lock, AlertTriangle, FileSpreadsheet, Download, Upload, Sparkles, RefreshCw } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import VaultPickerModal from '@/components/project/VaultPickerModal'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ChecklistItem, Document } from '@/types'
import EchecAction from '@/components/common/EchecAction'
import { messageErreur } from '@/lib/erreurs'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

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

  // C10 — score de conformité (les ⚠️ ne comptent pas conformes)
  const { data: score } = useQuery<{ conformes: number; total: number }>({
    queryKey: ['checklist-score', project.id, items],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${project.id}/checklist/score`)
      return data
    },
    enabled: items.length > 0,
  })

  const [pickerItem, setPickerItem] = useState<ChecklistItem | null>(null)

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

  // Complétion = pièces sous responsabilité de l'entreprise (fournir + completer).
  const scored = [...vaultItems, ...templateItems]
  const present = scored.filter((i) => i.status === 'present').length
  const missing = scored.filter((i) => i.status === 'manquant').length
  const total = scored.length
  const pct = total > 0 ? Math.round((present / total) * 100) : 0

  // ── Mutations ───────────────────────────────────────────────────
  // Rafraîchit la liste ET recalcule le score, sans quitter l'étape.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['checklist', project.id] })
    queryClient.invalidateQueries({ queryKey: ['checklist-score', project.id] })
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
      <p className="flex items-center gap-2 text-sm mb-4" style={{ color: '#959597' }}>
        <Loader2 size={15} className="animate-spin" style={{ color: '#E8E9EB' }} />
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
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', fontFamily: F }}
    >
      <p className="text-sm" style={{ color: '#909195' }}>
        La checklist des pièces apparaîtra automatiquement une fois le DCE analysé.
      </p>
    </div>
  )

  // ── Bottom bar ──────────────────────────────────────────────────

  const bottomBar = (
    <div
      className="sticky -bottom-5 z-30 -mx-3 sm:-mx-4 mt-6 rounded-t-lg flex items-center justify-between px-6 py-3 gap-4"
      style={{
        background: 'rgba(9,9,10,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,.07)',
        fontFamily: F,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#959597' }}>
          Complétion dossier
        </span>
        <div className="rounded-full overflow-hidden" style={{ width: 120, height: 6, background: '#1E1E21' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: '#E8E9EB' }}
          />
        </div>
        <span className="text-sm font-bold" style={{ color: '#E8E9EB' }}>{pct}%</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            isAlreadyDone
              ? navigate(`/projects/${project.id}/memoire`)
              : completeStep.mutate(4, {
                  onSuccess: () => navigate(`/projects/${project.id}/memoire`),
                })
          }
          disabled={completeStep.isPending}
          className="signature-btn"
        >
          {completeStep.isPending
            ? <><Loader2 size={16} className="animate-spin" /> Validation...</>
            : isAlreadyDone
            ? <>Étape suivante : Mémoire</>
            : <>Étape suivante : Mémoire</>}
        </button>
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-3" style={{ fontFamily: F }}>

      {/* Title bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display tracking-tight text-xl font-bold" style={{ color: '#F7F8F8' }}>
          Vérification de la candidature
        </h1>
        <div className="flex items-center gap-3">
          {/* Régénération DISCRÈTE à la demande (ex. après ajout de pièces au
              coffre). L'état par défaut n'est jamais « vide + bouton ». */}
          <button
            type="button"
            onClick={async () => {
              await api.post(`/projects/${project.id}/checklist/regenerate`)
              await refresh()
            }}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:underline"
            style={{ color: '#909195' }}
            title="Recalculer la checklist depuis les exigences analysées"
          >
            <RefreshCw size={13} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={openVaultPage}
            className="glass-btn flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ color: '#C2C3C6' }}
          >
            <Lock size={14} />
            Accéder au coffre-fort
          </button>
        </div>
      </div>

      {/* ── HÉROS DE PROGRESSION — où en est le dossier, en un regard ── */}
      <div className="glass-card top-lit blueprint-grid sheen relative overflow-hidden px-6 py-5">
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5">
          {/* Anneau de complétion */}
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke="#E8E9EB" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 34}
                strokeDashoffset={(2 * Math.PI * 34) * (1 - pct / 100)}
                style={{
                  transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)',
                  filter: 'drop-shadow(0 0 5px rgba(255,255,255,.4))',
                }}
              />
            </svg>
            <span className="num-mono absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: '#F7F8F8' }}>
              {pct}%
            </span>
          </div>

          {/* Le compte, en grand */}
          <div className="min-w-0 flex-1">
            <p className="microlabel mb-1.5">Dossier de candidature</p>
            <div className="flex flex-wrap items-end gap-2.5">
              <span className="num-mono bg-gradient-silver-text bg-clip-text text-4xl font-bold leading-none text-transparent">
                {present}<span className="text-2xl">/{total}</span>
              </span>
              <p className="pb-0.5 text-sm font-semibold" style={{ color: '#F7F8F8' }}>pièces réunies</p>
            </div>
            <p className="num-mono mt-2 text-xs" style={{ color: '#959597' }}>
              Coffre-fort {vaultItems.filter((i) => i.status === 'present').length}/{vaultItems.length}
              {'  ·  '}
              Formulaires DCE {templateItems.filter((i) => i.status === 'present').length}/{templateItems.length}
              {score ? <>{'  ·  '}Conformité {score.conformes}/{score.total}</> : null}
            </p>
          </div>
        </div>

        {missing > 0 && (
          <div className="relative mt-4 flex items-start gap-2.5 pt-3.5" style={{ borderTop: '1px solid var(--line)' }}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#F58E86' }} />
            <p className="text-xs leading-relaxed" style={{ color: '#959597' }}>
              <span className="font-semibold" style={{ color: '#F7F8F8' }}>
                {missing} pièce{missing > 1 ? 's' : ''} à fournir.
              </span>{' '}
              Le règlement de consultation demande ces pièces.
            </p>
          </div>
        )}
      </div>

      <CandidatureSectionVault
        items={vaultItems}
        onPickFromVault={(item) => setPickerItem(item)}
        onOpenVault={openVaultPage}
      />

      <CandidatureSectionTemplates
        projectId={project.id}
        items={templateItems}
        onUploadCompleted={handleUploadCompleted}
        onToggleSignature={async (item, confirmed) => {
          await api.patch(`/projects/${project.id}/checklist/${item.id}`, {
            signature_confirmed: confirmed,
          })
          await refresh()
          queryClient.invalidateQueries({ queryKey: ['checklist-score', project.id] })
        }}
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

      {bottomBar}
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
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', fontFamily: F }}
    >
      <header className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(217,164,65,0.10)' }}>
          <FileSpreadsheet size={18} style={{ color: '#D9A441' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: '#F7F8F8' }}>Bordereaux de prix (DPGF / BPU)</h2>
          <p className="text-xs mt-0.5" style={{ color: '#909195' }}>
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
    <li className="flex items-center gap-3 px-5 py-2.5 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
      <FileSpreadsheet size={15} style={{ color: '#D9A441' }} className="shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm" style={{ color: '#D8D9DB' }}>{item.details}</p>
        <span className="text-xs" style={{ color: done ? '#6EE7A8' : warn ? '#D9A441' : '#909195' }}>
          {done ? '✓ Rempli et vérifié' : warn ? '⚠️ À corriger (lignes sans prix)' : 'À remplir'}
        </span>
      </div>
      {item.lot && (
        <span className="text-xs px-1.5 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#B4B5B8' }}>
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
          style={{ border: '1px solid rgba(255,255,255,.07)', color: '#959597' }}
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
        style={{ color: '#D8D9DB' }}
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
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', fontFamily: F }}
    >
      <header className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <Sparkles size={18} style={{ color: '#E8E9EB' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: '#F7F8F8' }}>Généré par Synorix</h2>
          <p className="text-xs mt-0.5" style={{ color: '#909195' }}>
            Produit automatiquement à l&apos;étape suivante — aucune pièce à fournir ici.
          </p>
        </div>
      </header>
      <ul>
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
            <Sparkles size={15} style={{ color: '#E8E9EB' }} className="shrink-0" />
            <span className="text-sm flex-1 min-w-0" style={{ color: '#D8D9DB' }}>{i.details}</span>
            {i.lot && (
              <span className="text-xs px-1.5 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#B4B5B8' }}>
                {i.lot.replace(/^lot/i, 'Lot ')}
              </span>
            )}
            <span className="text-xs shrink-0" style={{ color: '#909195' }}>Étape Mémoire</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

