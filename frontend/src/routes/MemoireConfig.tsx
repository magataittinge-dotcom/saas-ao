import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building,
  Users,
  Wrench,
  ClipboardList,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  X,
} from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { MemoireSkeleton } from '@/components/skeletons'
import type { MemoireConfig, CAEntry, PosteCle } from '@/types'

// ─── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'entreprise',
    label: 'Entreprise',
    icon: Building,
    fields: ['nom_entreprise', 'date_creation', 'gerant_nom', 'gerant_titre', 'zone_intervention', 'historique', 'activites', 'chiffre_affaires'],
  },
  {
    id: 'equipe',
    label: 'Équipe',
    icon: Users,
    fields: ['organigramme_description', 'postes_cles'],
  },
  {
    id: 'moyens',
    label: 'Moyens',
    icon: Wrench,
    fields: ['moyens_informatiques', 'vehicules', 'materiel'],
  },
  {
    id: 'methodologie',
    label: 'Méthodologie standard',
    icon: ClipboardList,
    fields: ['demarche_qualite', 'procedure_demarrage', 'gestion_securite', 'traitement_dechets', 'mesures_environnementales'],
  },
  {
    id: 'fournisseurs',
    label: 'Fournisseurs',
    icon: ShoppingCart,
    fields: ['fournisseurs_principaux'],
  },
]

const FIELD_LABELS: Record<string, string> = {
  nom_entreprise: "Nom de l'entreprise",
  date_creation: 'Date de création',
  gerant_nom: 'Nom du gérant',
  gerant_titre: 'Titre / fonction',
  zone_intervention: "Zone d'intervention géographique",
  historique: 'Historique & parcours',
  activites: 'Activités principales',
  chiffre_affaires: "Chiffre d'affaires (3 dernières années)",
  organigramme_description: "Description de l'organigramme",
  postes_cles: 'Postes clés',
  moyens_informatiques: 'Moyens informatiques',
  vehicules: 'Véhicules',
  materiel: 'Matériel',
  demarche_qualite: 'Démarche qualité',
  procedure_demarrage: 'Procédure de démarrage chantier',
  gestion_securite: 'Gestion de la sécurité',
  traitement_dechets: 'Traitement des déchets',
  mesures_environnementales: 'Mesures environnementales',
  fournisseurs_principaux: 'Fournisseurs principaux',
}

// ─── Helper: count filled fields ──────────────────────────────────────────────

function countFilled(data: Partial<MemoireConfig>, fieldIds: string[]): [number, number] {
  let filled = 0
  for (const f of fieldIds) {
    const val = (data as Record<string, unknown>)[f]
    if (f === 'chiffre_affaires') {
      const ca = val as CAEntry[] | undefined
      if (ca?.some((e) => e.annee || e.montant)) filled++
    } else if (f === 'postes_cles') {
      const pk = val as PosteCle[] | undefined
      if (pk?.some((e) => e.nom)) filled++
    } else if (typeof val === 'string' && val.trim()) {
      filled++
    }
  }
  return [filled, fieldIds.length]
}

// ─── Import progress overlay ───────────────────────────────────────────────────

function ImportProgress({ isImporting }: { isImporting: boolean }) {
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isImporting) return
    setProgress(0)
    let current = 0
    const STAGES = [
      { upTo: 15, ms: 150 },
      { upTo: 40, ms: 400 },
      { upTo: 80, ms: 600 },
      { upTo: 99, ms: 1200 },
    ]
    const tick = () => {
      current += 1
      setProgress(current)
      if (current < 99) {
        const stage = STAGES.find((s) => current < s.upTo) ?? STAGES[STAGES.length - 1]
        timerRef.current = setTimeout(tick, stage.ms)
      }
    }
    timerRef.current = setTimeout(tick, 150)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [isImporting])

  if (!isImporting) return null

  const RADIUS = 70
  const CIRC = 2 * Math.PI * RADIUS
  const offset = CIRC * (1 - progress / 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-5 min-w-64"
        style={{ background: '#151A23', border: '1px solid rgba(120,130,149,0.2)' }}
      >
        <div className="relative w-40 h-40">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="rgba(120,130,149,0.2)" strokeWidth="10" />
            <circle
              cx="80" cy="80" r={RADIUS} fill="none"
              stroke="#E4E9F2" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.35s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-bold text-ds-text">{progress}%</span>
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-ds-text">
            {progress < 20 ? 'Lecture du document...' :
             progress < 60 ? 'Analyse par Synorix IA...' :
             progress < 90 ? 'Extraction des informations...' :
             'Finalisation...'}
          </p>
          <p className="text-sm text-ds-text-2">L'IA extrait vos données (~15s)</p>
        </div>
      </div>
    </div>
  )
}

// ─── Import dialog ─────────────────────────────────────────────────────────────

interface ImportDialogProps {
  onClose: () => void
  onImported: (extracted: Partial<MemoireConfig>, count: number) => void
}

function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { mutate: doImport, isPending } = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      const { data } = await api.post<{ extracted: Record<string, unknown>; fields_count: number }>(
        '/memoire-config/import',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data
    },
    onSuccess: ({ extracted, fields_count }) => {
      onImported(extracted as Partial<MemoireConfig>, fields_count)
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? "Erreur lors de l'import")
        : "Erreur lors de l'import"
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(docx|pdf)$/i)) {
      setError('Seuls les fichiers .docx et .pdf sont acceptés')
      return
    }
    setFile(f)
    setError(null)
  }

  return (
    <>
      <ImportProgress isImporting={isPending} />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div
          className="rounded-2xl shadow-2xl w-full max-w-md mx-4"
          style={{ background: '#151A23', border: '1px solid rgba(120,130,149,0.2)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid rgba(120,130,149,0.15)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={18} style={{ color: '#E4E9F2' }} />
              <h2 className="font-semibold text-ds-text">Importer un mémoire existant</h2>
            </div>
            <button onClick={onClose} className="text-ds-text-2 hover:text-ds-text transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-ds-text-2">
              Uploadez un mémoire technique existant (.docx ou .pdf).
              Synorix IA extraira automatiquement toutes les informations et pré-remplira le formulaire.
            </p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              )}
              style={{
                borderColor: dragOver
                  ? '#E4E9F2'
                  : file
                  ? '#E4E9F2'
                  : 'rgba(120,130,149,0.35)',
                background: dragOver
                  ? 'rgba(228,233,242,0.08)'
                  : file
                  ? 'rgba(228,233,242,0.08)'
                  : '#1C222D',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 size={28} style={{ color: '#6EE7A8' }} />
                  <p className="text-sm font-medium" style={{ color: '#F4F6FA' }}>{file.name}</p>
                  <p className="text-xs text-ds-text-3">{(file.size / 1024).toFixed(0)} Ko</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={28} className="text-ds-text-3 opacity-50" />
                  <p className="text-sm font-medium text-ds-text-2">Glissez votre fichier ici</p>
                  <p className="text-xs text-ds-text-3">ou cliquez pour parcourir • .docx, .pdf</p>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-400 rounded-lg px-3 py-2"
                style={{ background: 'rgba(245,142,134,0.1)', border: '1px solid rgba(245,142,134,0.3)' }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-6 py-4"
            style={{ borderTop: '1px solid rgba(120,130,149,0.15)' }}
          >
            <button
              onClick={onClose}
              className="btn-glass text-sm px-4 py-2"
            >
              Annuler
            </button>
            <button
              onClick={() => file && doImport(file)}
              disabled={!file || isPending}
              className="btn-primary flex items-center gap-2 text-sm font-semibold py-2 px-5 disabled:opacity-60"
            >
              <Sparkles size={15} />
              {isPending ? "Extraction en cours..." : "Importer et pré-remplir"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Accordion section wrapper ─────────────────────────────────────────────────

function Section({
  section,
  data,
  isOpen,
  onToggle,
  children,
  hidden = false,
}: {
  section: typeof SECTIONS[0]
  data: Partial<MemoireConfig>
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
  hidden?: boolean
}) {
  const [filled, total] = countFilled(data, section.fields)
  const Icon = section.icon
  const complete = filled === total

  if (hidden) return null

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(120,130,149,0.2)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 transition-colors text-left"
        style={{ background: '#1C222D' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#1C222D')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#1C222D')}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: complete ? 'rgba(228,233,242,0.10)' : 'rgba(228,233,242,0.15)',
            }}
          >
            <Icon size={16} style={{ color: complete ? '#E4E9F2' : '#E4E9F2' }} />
          </div>
          <span className="font-medium text-ds-text">{section.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={
              complete
                ? { background: 'rgba(228,233,242,0.10)', color: '#F4F6FA' }
                : filled > 0
                ? { background: 'rgba(120,130,149,0.08)', color: '#9BA4B5' }
                : { background: 'rgba(120,130,149,0.15)', color: '#9BA4B5' }
            }
          >
            {filled}/{total}
          </span>
          {isOpen
            ? <ChevronUp size={16} className="text-ds-text-2" />
            : <ChevronDown size={16} className="text-ds-text-2" />
          }
        </div>
      </button>

      {isOpen && (
        <div
          className="px-5 pb-5 pt-2 space-y-4"
          style={{
            background: '#1C222D',
            borderTop: '1px solid rgba(120,130,149,0.15)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center justify-between text-sm font-medium text-ds-text-2 mb-1">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ds-text-3">optionnel</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
// B6 — le profil mémoire vit dans « Mon entreprise » (onglets) : ce composant
// est l'éditeur réutilisable, filtrable par sections. Il n'y a plus de page
// « Mémoire technique » séparée (/memoire-config redirige vers /company).

export function ProfilMemoireEditor({
  visibleSections,
  showImport = false,
}: {
  visibleSections?: string[]
  showImport?: boolean
}) {
  const shown = (id: string) => !visibleSections || visibleSections.includes(id)
  const queryClient = useQueryClient()
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['entreprise']))
  const [form, setForm] = useState<Partial<MemoireConfig>>({})
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importBanner, setImportBanner] = useState<{ count: number } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['memoire-config'],
    queryFn: async () => {
      const { data } = await api.get<MemoireConfig>('/memoire-config')
      return data
    },
  })

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () => api.put<MemoireConfig>('/memoire-config', form),
    onSuccess: ({ data: updated }) => {
      queryClient.setQueryData(['memoire-config'], updated)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    },
  })

  const set = (field: keyof MemoireConfig, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleImported = (extracted: Partial<MemoireConfig>, count: number) => {
    // Merge extracted data into form (skip null/empty values)
    setForm((prev) => {
      const merged = { ...prev }
      for (const [k, v] of Object.entries(extracted)) {
        if (v !== null && v !== undefined && v !== '' &&
            !(Array.isArray(v) && v.length === 0)) {
          (merged as Record<string, unknown>)[k] = v
        }
      }
      return merged
    })
    // Open all sections so user can review
    setOpenSections(new Set(SECTIONS.map((s) => s.id)))
    setImportBanner({ count })
    setShowImportDialog(false)
    // Auto-dismiss banner after 8s
    setTimeout(() => setImportBanner(null), 8000)
  }

  // Overall progress
  const allFields = SECTIONS.flatMap((s) => s.fields)
  const [totalFilled, totalFields] = countFilled(form, allFields)
  const pct = Math.round((totalFilled / totalFields) * 100)

  if (isLoading) {
    return <MemoireSkeleton />
  }

  const ca: CAEntry[] = form.chiffre_affaires ?? [
    { annee: '', montant: '' },
    { annee: '', montant: '' },
    { annee: '', montant: '' },
  ]

  const postes: PosteCle[] = form.postes_cles ?? [
    { poste: 'Directeur Travaux', nom: '', role: '' },
    { poste: 'Conducteur Travaux', nom: '', role: '' },
    { poste: 'Chef de Chantier', nom: '', role: '' },
    { poste: 'Administration', nom: '', role: '' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24 animate-fade-in">
      {/* Import dialog */}
      {showImportDialog && (
        <ImportDialog
          onClose={() => setShowImportDialog(false)}
          onImported={handleImported}
        />
      )}

      {/* Import d'un mémoire de référence (onglet Certifications & références) */}
      {showImport && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ds-text-2">
            Un mémoire déjà rédigé ? Importez-le : l'IA pré-remplit votre profil.
          </p>
          <button
            onClick={() => setShowImportDialog(true)}
            className="btn-glass flex items-center gap-2 text-sm font-medium py-2 px-4 shrink-0"
          >
            <Upload size={15} />
            Importer un mémoire
          </button>
        </div>
      )}

      {/* Import success banner */}
      {importBanner && (
        <div
          className="flex items-center justify-between rounded-xl px-4 py-3"
          style={{
            background: 'rgba(228,233,242,0.10)',
            border: '1px solid rgba(228,233,242,0.25)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} style={{ color: '#E4E9F2' }} />
            <p className="text-sm font-medium" style={{ color: '#F4F6FA' }}>
              {importBanner.count}/18 champs pré-remplis par l'IA — vérifiez et complétez avant de sauvegarder
            </p>
          </div>
          <button onClick={() => setImportBanner(null)} style={{ color: '#9BA4B5' }} className="opacity-70 hover:opacity-100 transition-opacity">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ds-text-2">Configuration complétée à {pct}%</span>
          <span className="text-xs text-ds-text-3">{totalFilled}/{totalFields} champs</span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: 'rgba(120,130,149,0.2)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct === 100
                ? '#E4E9F2'
                : `linear-gradient(to right, #E4E9F2, ${pct > 60 ? '#E4E9F2' : '#9FA9BC'})`,
            }}
          />
        </div>
        {pct === 100 && (
          <p className="text-xs font-medium mt-2 flex items-center gap-1" style={{ color: '#6EE7A8' }}>
            <CheckCircle2 size={13} /> Profil mémoire complet — la génération sera optimale
          </p>
        )}
      </div>

      {/* Accordion sections */}
      <div className="space-y-3">

        {/* ENTREPRISE */}
        <Section section={SECTIONS[0]} data={form} isOpen={openSections.has('entreprise')} onToggle={() => toggleSection('entreprise')} hidden={!shown('entreprise')}>
          <Field label={FIELD_LABELS.nom_entreprise}>
            <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Ex: SARL DUPONT BTP"
              value={form.nom_entreprise ?? ''} onChange={(e) => set('nom_entreprise', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={FIELD_LABELS.date_creation} optional>
              <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Ex: 2005"
                value={form.date_creation ?? ''} onChange={(e) => set('date_creation', e.target.value)} />
            </Field>
            <Field label={FIELD_LABELS.gerant_nom}>
              <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Jean Dupont"
                value={form.gerant_nom ?? ''} onChange={(e) => set('gerant_nom', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={FIELD_LABELS.gerant_titre} optional>
              <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Gérant, PDG, Directeur..."
                value={form.gerant_titre ?? ''} onChange={(e) => set('gerant_titre', e.target.value)} />
            </Field>
            <Field label={FIELD_LABELS.zone_intervention} optional>
              <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Ex: Île-de-France, PACA..."
                value={form.zone_intervention ?? ''} onChange={(e) => set('zone_intervention', e.target.value)} />
            </Field>
          </div>
          <Field label={FIELD_LABELS.historique} optional>
            <textarea className="glass-input w-full py-2.5 text-sm" rows={4} placeholder="Fondée en 2005, notre entreprise..."
              style={{ resize: 'vertical' }}
              value={form.historique ?? ''} onChange={(e) => set('historique', e.target.value)} />
          </Field>
          <Field label={FIELD_LABELS.activites}>
            <textarea className="glass-input w-full py-2.5 text-sm" rows={3} placeholder="Maçonnerie, gros œuvre, rénovation..."
              style={{ resize: 'vertical' }}
              value={form.activites ?? ''} onChange={(e) => set('activites', e.target.value)} />
          </Field>

          <Field label={FIELD_LABELS.chiffre_affaires} optional>
            <div className="space-y-2">
              {ca.map((entry, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" className="glass-input w-full py-2.5 text-sm w-24" placeholder="Année"
                    value={entry.annee}
                    onChange={(e) => set('chiffre_affaires', ca.map((r, j) => j === i ? { ...r, annee: e.target.value } : r))} />
                  <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Ex: 1 200 000 €"
                    value={entry.montant}
                    onChange={(e) => set('chiffre_affaires', ca.map((r, j) => j === i ? { ...r, montant: e.target.value } : r))} />
                  {ca.length > 1 && (
                    <button onClick={() => set('chiffre_affaires', ca.filter((_, j) => j !== i))}
                      className="text-ds-text-3 hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
              <button onClick={() => set('chiffre_affaires', [...ca, { annee: '', montant: '' }])}
                className="flex items-center gap-1.5 text-xs font-medium mt-1 transition-colors"
                style={{ color: '#E4E9F2' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <Plus size={13} /> Ajouter une année
              </button>
            </div>
          </Field>
        </Section>

        {/* ÉQUIPE */}
        <Section section={SECTIONS[1]} data={form} isOpen={openSections.has('equipe')} onToggle={() => toggleSection('equipe')} hidden={!shown('equipe')}>
          <Field label={FIELD_LABELS.organigramme_description} optional>
            <textarea className="glass-input w-full py-2.5 text-sm" rows={3} placeholder="1 gérant + 2 conducteurs de travaux + 8 ouvriers..."
              style={{ resize: 'vertical' }}
              value={form.organigramme_description ?? ''} onChange={(e) => set('organigramme_description', e.target.value)} />
          </Field>
          <Field label={FIELD_LABELS.postes_cles} optional>
            <div className="space-y-3">
              {postes.map((poste, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 gap-2 items-start rounded-lg p-3"
                  style={{ background: '#151A23', border: '1px solid rgba(120,130,149,0.15)' }}
                >
                  <div>
                    <p className="text-xs text-ds-text-3 mb-1">Poste</p>
                    <input type="text" className="glass-input w-full py-2.5 text-sm" value={poste.poste}
                      onChange={(e) => set('postes_cles', postes.map((p, j) => j === i ? { ...p, poste: e.target.value } : p))} />
                  </div>
                  <div>
                    <p className="text-xs text-ds-text-3 mb-1">Nom</p>
                    <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Jean Dupont" value={poste.nom}
                      onChange={(e) => set('postes_cles', postes.map((p, j) => j === i ? { ...p, nom: e.target.value } : p))} />
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <p className="text-xs text-ds-text-3 mb-1">Rôle / missions</p>
                      <input type="text" className="glass-input w-full py-2.5 text-sm" placeholder="Supervision..." value={poste.role}
                        onChange={(e) => set('postes_cles', postes.map((p, j) => j === i ? { ...p, role: e.target.value } : p))} />
                    </div>
                    {postes.length > 1 && (
                      <button onClick={() => set('postes_cles', postes.filter((_, j) => j !== i))}
                        className="mt-6 text-ds-text-3 hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => set('postes_cles', [...postes, { poste: '', nom: '', role: '' }])}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: '#E4E9F2' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <Plus size={13} /> Ajouter un poste
              </button>
            </div>
          </Field>
        </Section>

        {/* MOYENS */}
        <Section section={SECTIONS[2]} data={form} isOpen={openSections.has('moyens')} onToggle={() => toggleSection('moyens')} hidden={!shown('moyens')}>
          {(['moyens_informatiques', 'vehicules', 'materiel'] as const).map((field) => (
            <Field key={field} label={FIELD_LABELS[field]} optional>
              <textarea className="glass-input w-full py-2.5 text-sm" rows={3}
                style={{ resize: 'vertical' }}
                placeholder={
                  field === 'moyens_informatiques' ? 'AutoCAD, MS Project, tablettes chantier...' :
                  field === 'vehicules' ? '2 camions benne 3.5T, 1 nacelle 12m...' :
                  'Bétonnières, coffrages métalliques, échafaudages...'
                }
                value={(form[field] as string) ?? ''}
                onChange={(e) => set(field, e.target.value)} />
            </Field>
          ))}
        </Section>

        {/* MÉTHODOLOGIE */}
        <Section section={SECTIONS[3]} data={form} isOpen={openSections.has('methodologie')} onToggle={() => toggleSection('methodologie')} hidden={!shown('methodologie')}>
          {(['demarche_qualite', 'procedure_demarrage', 'gestion_securite', 'traitement_dechets', 'mesures_environnementales'] as const).map((field) => (
            <Field key={field} label={FIELD_LABELS[field]} optional>
              <textarea className="glass-input w-full py-2.5 text-sm" rows={4}
                style={{ resize: 'vertical' }}
                placeholder={
                  field === 'demarche_qualite' ? "Notre démarche qualité repose sur..." :
                  field === 'procedure_demarrage' ? "Dès réception de l'ordre de service, nous..." :
                  field === 'gestion_securite' ? "Nous établissons un PPSPS dès le début..." :
                  field === 'traitement_dechets' ? "Tri sélectif sur chantier, bennes dédiées..." :
                  "Réduction des nuisances sonores, protection des riverains..."
                }
                value={(form[field] as string) ?? ''}
                onChange={(e) => set(field, e.target.value)} />
            </Field>
          ))}
        </Section>

        {/* FOURNISSEURS */}
        <Section section={SECTIONS[4]} data={form} isOpen={openSections.has('fournisseurs')} onToggle={() => toggleSection('fournisseurs')} hidden={!shown('fournisseurs')}>
          <Field label={FIELD_LABELS.fournisseurs_principaux} optional>
            <textarea className="glass-input w-full py-2.5 text-sm" rows={4}
              style={{ resize: 'vertical' }}
              placeholder="Lafarge Holcim (béton), Point P (matériaux), Kiloutou (location matériel)..."
              value={form.fournisseurs_principaux ?? ''}
              onChange={(e) => set('fournisseurs_principaux', e.target.value)} />
          </Field>
        </Section>
      </div>

      {/* Sticky save bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur px-6 py-3"
        style={{
          background: 'rgba(10,12,17,0.92)',
          borderTop: '1px solid rgba(120,130,149,0.2)',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <p className="text-sm text-ds-text-2">
            {pct === 100
              ? 'Toutes les sections sont renseignées'
              : `${totalFields - totalFilled} champ${totalFields - totalFilled > 1 ? 's' : ''} restant${totalFields - totalFilled > 1 ? 's' : ''}`}
          </p>
          <button
            onClick={() => save()}
            disabled={isSaving}
            className="btn-primary flex items-center gap-2 font-semibold py-2.5 px-6 disabled:opacity-60"
          >
            {saveSuccess ? (
              <><CheckCircle2 size={16} style={{ color: '#6EE7A8' }} />Sauvegardé</>
            ) : (
              <><Save size={16} />{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
