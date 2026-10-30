import { cloneElement, isValidElement, useId, useState, useEffect, useRef } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
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

// Boutons d'édition des listes (année, poste) : lien d'accent, retrait discret ; cibles 44 px au téléphone.
const BOUTON_AJOUT = 'inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11'
const BOUTON_RETRAIT = 'grid size-9 shrink-0 place-items-center rounded-md text-fg-3 transition-colors duration-base ease-lien hover:bg-surface-0 hover:text-danger [@media(pointer:coarse)]:size-11'

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
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-voile backdrop-blur-sm">
      <div className="flex min-w-64 flex-col items-center gap-5 rounded-2xl border border-bord-2 bg-surface-pop p-10 shadow-pop">
        <div className="relative h-40 w-40">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160" aria-hidden>
            <circle cx="80" cy="80" r={RADIUS} fill="none" className="stroke-surface-2" strokeWidth="10" />
            <circle
              cx="80" cy="80" r={RADIUS} fill="none"
              className="stroke-accent-ui" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.35s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-3xl font-bold text-fg">{progress}%</span>
          </div>
        </div>
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold text-fg">
            {progress < 20 ? 'Lecture du document...' :
             progress < 60 ? 'Analyse par Synorix IA...' :
             progress < 90 ? 'Extraction des informations...' :
             'Finalisation...'}
          </p>
          <p className="text-sm text-fg-2">L'IA extrait vos données (~15s)</p>
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
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-voile backdrop-blur-sm"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-titre"
          className="mx-4 w-full max-w-md rounded-2xl border border-bord-2 bg-surface-pop shadow-pop"
        >
          {/* En-tête */}
          <div className="flex items-center justify-between border-b border-bord px-6 py-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-accent-text" aria-hidden />
              <h2 id="import-titre" className="font-semibold text-fg">Importer un mémoire existant</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="grid size-9 place-items-center rounded-md text-fg-2 transition-colors duration-base ease-lien hover:bg-surface-1 hover:text-fg [@media(pointer:coarse)]:size-11"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* Corps */}
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-fg-2">
              Déposez un mémoire technique existant (.docx ou .pdf).
              Synorix IA extraira automatiquement toutes les informations et pré-remplira le formulaire.
            </p>

            {/* Zone de dépôt */}
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              className={cn(
                'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-base ease-lien',
                dragOver || file ? 'border-accent-ring bg-accent-tint' : 'border-input bg-surface-1 hover:border-fg-3',
              )}
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
                  <CheckCircle2 size={28} className="text-success" aria-hidden />
                  <p className="text-sm font-medium text-fg">{file.name}</p>
                  <p className="text-xs text-fg-3">{(file.size / 1024).toFixed(0)} Ko</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={28} className="text-fg-3" aria-hidden />
                  <p className="text-sm font-medium text-fg-2">Glissez votre fichier ici</p>
                  <p className="text-xs text-fg-3">ou cliquez pour parcourir • .docx, .pdf</p>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          {/* Pied */}
          <div className="flex items-center justify-end gap-3 border-t border-bord px-6 py-4">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={() => file && doImport(file)} disabled={!file || isPending}>
              <Sparkles size={15} aria-hidden />
              {isPending ? "Extraction en cours..." : "Importer et pré-remplir"}
            </Button>
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
  const panneauId = useId()

  if (hidden) return null

  return (
    <div className="overflow-hidden rounded-xl border border-bord-2">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panneauId}
        className="flex w-full items-center justify-between bg-surface-1 px-5 py-4 text-left transition-colors duration-base ease-lien hover:bg-surface-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent-tint">
            <Icon size={16} className="text-accent-text" aria-hidden />
          </div>
          <span className="font-medium text-fg">{section.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={complete ? 'success' : filled > 0 ? 'accent' : 'neutral'} className="tabular-nums">
            {filled}/{total}
          </Badge>
          {isOpen
            ? <ChevronUp size={16} className="text-fg-2" aria-hidden />
            : <ChevronDown size={16} className="text-fg-2" aria-hidden />
          }
        </div>
      </button>

      {isOpen && (
        <div id={panneauId} className="space-y-4 border-t border-bord bg-surface-1 px-5 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

// Champ : l'étiquette est reliée au champ (id) ; `groupe` = plusieurs champs sous un même intitulé (pas de « for »).
function Field({ label, optional, groupe, children }: { label: string; optional?: boolean; groupe?: boolean; children: React.ReactElement | React.ReactNode }) {
  const id = useId()
  const enfant = !groupe && isValidElement(children) ? cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children
  const Tete = groupe ? 'span' : 'label'
  return (
    <div>
      <Tete {...(groupe ? {} : { htmlFor: id })} className="mb-1 flex items-center justify-between text-sm font-medium text-fg-2">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-fg-3">optionnel</span>}
      </Tete>
      {enfant}
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
    <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
      {/* Import dialog */}
      {showImportDialog && (
        <ImportDialog
          onClose={() => setShowImportDialog(false)}
          onImported={handleImported}
        />
      )}

      {/* Import d'un mémoire de référence (onglet Certifications & références) */}
      {showImport && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-fg-2">
            Un mémoire déjà rédigé ? Importez-le : l'IA pré-remplit votre profil.
          </p>
          <Button variant="outline" onClick={() => setShowImportDialog(true)} className="shrink-0">
            <Upload size={15} aria-hidden />
            Importer un mémoire
          </Button>
        </div>
      )}

      {/* Import success banner */}
      {importBanner && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-accent-tint-2 bg-accent-tint px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-accent-text" aria-hidden />
            <p className="text-sm font-medium text-fg">
              {importBanner.count}/18 champs pré-remplis par l'IA — vérifiez et complétez avant de sauvegarder
            </p>
          </div>
          <button
            onClick={() => setImportBanner(null)}
            aria-label="Fermer le message"
            className="grid size-9 shrink-0 place-items-center rounded-md text-fg-2 transition-colors duration-base ease-lien hover:bg-surface-0 hover:text-fg [@media(pointer:coarse)]:size-11"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      {/* Avancement du profil */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-2">Configuration complétée à {pct}%</span>
          <span className="text-xs text-fg-3">{totalFilled}/{totalFields} champs</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Avancement du profil mémoire"
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-morph ease-lien', pct === 100 ? 'bg-success' : 'bg-accent-ui')}
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 size={13} aria-hidden /> Profil mémoire complet — la génération sera optimale
          </p>
        )}
      </Card>

      {/* Accordion sections */}
      <div className="space-y-3">

        {/* ENTREPRISE */}
        <Section section={SECTIONS[0]} data={form} isOpen={openSections.has('entreprise')} onToggle={() => toggleSection('entreprise')} hidden={!shown('entreprise')}>
          <Field label={FIELD_LABELS.nom_entreprise}>
            <Input type="text" className="py-2.5" placeholder="Ex: SARL DUPONT BTP"
              value={form.nom_entreprise ?? ''} onChange={(e) => set('nom_entreprise', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={FIELD_LABELS.date_creation} optional>
              <Input type="text" className="py-2.5" placeholder="Ex: 2005"
                value={form.date_creation ?? ''} onChange={(e) => set('date_creation', e.target.value)} />
            </Field>
            <Field label={FIELD_LABELS.gerant_nom}>
              <Input type="text" className="py-2.5" placeholder="Jean Dupont"
                value={form.gerant_nom ?? ''} onChange={(e) => set('gerant_nom', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={FIELD_LABELS.gerant_titre} optional>
              <Input type="text" className="py-2.5" placeholder="Gérant, PDG, Directeur..."
                value={form.gerant_titre ?? ''} onChange={(e) => set('gerant_titre', e.target.value)} />
            </Field>
            <Field label={FIELD_LABELS.zone_intervention} optional>
              <Input type="text" className="py-2.5" placeholder="Ex: Île-de-France, PACA..."
                value={form.zone_intervention ?? ''} onChange={(e) => set('zone_intervention', e.target.value)} />
            </Field>
          </div>
          <Field label={FIELD_LABELS.historique} optional>
            <Textarea className="resize-y py-2.5" rows={4} placeholder="Fondée en 2005, notre entreprise..."
              value={form.historique ?? ''} onChange={(e) => set('historique', e.target.value)} />
          </Field>
          <Field label={FIELD_LABELS.activites}>
            <Textarea className="resize-y py-2.5" rows={3} placeholder="Maçonnerie, gros œuvre, rénovation..."
              value={form.activites ?? ''} onChange={(e) => set('activites', e.target.value)} />
          </Field>

          <Field label={FIELD_LABELS.chiffre_affaires} optional groupe>
            <div className="space-y-2">
              {ca.map((entry, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input type="text" aria-label="Année" className="w-24 py-2.5" placeholder="Année"
                    value={entry.annee}
                    onChange={(e) => set('chiffre_affaires', ca.map((r, j) => j === i ? { ...r, annee: e.target.value } : r))} />
                  <Input type="text" aria-label="Montant" className="py-2.5" placeholder="Ex: 1 200 000 €"
                    value={entry.montant}
                    onChange={(e) => set('chiffre_affaires', ca.map((r, j) => j === i ? { ...r, montant: e.target.value } : r))} />
                  {ca.length > 1 && (
                    <button onClick={() => set('chiffre_affaires', ca.filter((_, j) => j !== i))}
                      aria-label="Retirer cette année" className={BOUTON_RETRAIT}><Trash2 size={14} aria-hidden /></button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => set('chiffre_affaires', [...ca, { annee: '', montant: '' }])}
                className={cn(BOUTON_AJOUT, 'mt-1')}
              >
                <Plus size={13} aria-hidden /> Ajouter une année
              </button>
            </div>
          </Field>
        </Section>

        {/* ÉQUIPE */}
        <Section section={SECTIONS[1]} data={form} isOpen={openSections.has('equipe')} onToggle={() => toggleSection('equipe')} hidden={!shown('equipe')}>
          <Field label={FIELD_LABELS.organigramme_description} optional>
            <Textarea className="resize-y py-2.5" rows={3} placeholder="1 gérant + 2 conducteurs de travaux + 8 ouvriers..."
              value={form.organigramme_description ?? ''} onChange={(e) => set('organigramme_description', e.target.value)} />
          </Field>
          <Field label={FIELD_LABELS.postes_cles} optional groupe>
            <div className="space-y-3">
              {postes.map((poste, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 items-start gap-2 rounded-lg border border-bord bg-surface-0 p-3 sm:grid-cols-3"
                >
                  <div>
                    <p className="mb-1 text-xs text-fg-3">Poste</p>
                    <Input type="text" aria-label={`Poste ${i + 1} : intitulé`} className="py-2.5" value={poste.poste}
                      onChange={(e) => set('postes_cles', postes.map((p, j) => j === i ? { ...p, poste: e.target.value } : p))} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-fg-3">Nom</p>
                    <Input type="text" aria-label={`Poste ${i + 1} : nom`} className="py-2.5" placeholder="Jean Dupont" value={poste.nom}
                      onChange={(e) => set('postes_cles', postes.map((p, j) => j === i ? { ...p, nom: e.target.value } : p))} />
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <p className="mb-1 text-xs text-fg-3">Rôle / missions</p>
                      <Input type="text" aria-label={`Poste ${i + 1} : rôle et missions`} className="py-2.5" placeholder="Supervision..." value={poste.role}
                        onChange={(e) => set('postes_cles', postes.map((p, j) => j === i ? { ...p, role: e.target.value } : p))} />
                    </div>
                    {postes.length > 1 && (
                      <button onClick={() => set('postes_cles', postes.filter((_, j) => j !== i))}
                        aria-label="Retirer ce poste" className={cn(BOUTON_RETRAIT, 'mt-6')}><Trash2 size={14} aria-hidden /></button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => set('postes_cles', [...postes, { poste: '', nom: '', role: '' }])}
                className={BOUTON_AJOUT}
              >
                <Plus size={13} aria-hidden /> Ajouter un poste
              </button>
            </div>
          </Field>
        </Section>

        {/* MOYENS */}
        <Section section={SECTIONS[2]} data={form} isOpen={openSections.has('moyens')} onToggle={() => toggleSection('moyens')} hidden={!shown('moyens')}>
          {(['moyens_informatiques', 'vehicules', 'materiel'] as const).map((field) => (
            <Field key={field} label={FIELD_LABELS[field]} optional>
              <Textarea className="resize-y py-2.5" rows={3}
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
              <Textarea className="resize-y py-2.5" rows={4}
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
            <Textarea className="resize-y py-2.5" rows={4}
              placeholder="Lafarge Holcim (béton), Point P (matériaux), Kiloutou (location matériel)..."
              value={form.fournisseurs_principaux ?? ''}
              onChange={(e) => set('fournisseurs_principaux', e.target.value)} />
          </Field>
        </Section>
      </div>

      {/* Barre d'enregistrement : reste en bas de la zone de défilement (au-dessus des onglets du téléphone) */}
      <div className="sticky bottom-0 z-20 -mx-3 border-t border-bord-2 bg-[var(--glass-fill)] px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-2">
            {pct === 100
              ? 'Toutes les sections sont renseignées'
              : `${totalFields - totalFilled} champ${totalFields - totalFilled > 1 ? 's' : ''} restant${totalFields - totalFilled > 1 ? 's' : ''}`}
          </p>
          <Button onClick={() => save()} disabled={isSaving} size="lg" className="px-6">
            {saveSuccess ? (
              <><CheckCircle2 size={16} aria-hidden />Sauvegardé</>
            ) : (
              <><Save size={16} aria-hidden />{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
