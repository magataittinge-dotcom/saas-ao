import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  Sparkles, Save, RotateCcw, CheckCircle2, ChevronDown, ChevronUp,
  Pencil, X, Download, Building2, BarChart3, Settings2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import axios from 'axios'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { AnalysisProgress } from '@/components/project/AnalysisProgress'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import type { Project, MemoireTechnique, MemoireContent, CritereJugement } from '@/types'

// ─── Memoire generation stages ────────────────────────────────────────────────

const MEMOIRE_STAGES = [
  { upTo: 5,  message: 'Analyse des critères de jugement...', msPerStep: 400 },
  { upTo: 20, message: 'Lecture du profil entreprise...', msPerStep: 600 },
  { upTo: 50, message: 'Rédaction de la présentation...', msPerStep: 1400 },
  { upTo: 75, message: 'Rédaction de la méthodologie...', msPerStep: 1800 },
  { upTo: 90, message: 'Rédaction des moyens et planning...', msPerStep: 2200 },
  { upTo: 99, message: 'Finalisation du mémoire...', msPerStep: 5000 },
]

// ─── Build flat Markdown ───────────────────────────────────────────────────────

function buildFullMarkdown(content: MemoireContent): string {
  const lines: string[] = []
  lines.push('# PRÉAMBULE\n')
  lines.push(content.preambule ?? '')
  lines.push('\n---\n\n# PARTIE A — PRÉSENTATION GÉNÉRALE\n')
  const a = content.partie_a as Record<string, string>
  const aLabels: [string, string][] = [
    ['implantation', '## 1. Implantation géographique'],
    ['historique', '## 2. Historique'],
    ['engagement_qualitatif', '## 3. Engagement qualitatif'],
    ['activites', '## 4. Nos activités'],
    ['organigramme', '## 5. Organigramme'],
    ['roles_missions', "## 6. Rôles et missions de l'équipe d'encadrement"],
    ['moyens_informatiques', '## 7. Moyens informatiques'],
    ['vehicules', '## 8. Véhicules'],
    ['materiel', '## 9. Matériel'],
    ['references', '## 10. Références chantiers'],
    ['fournisseurs', '## 11. Fournisseurs'],
  ]
  for (const [key, heading] of aLabels) {
    if (a?.[key]) lines.push(`\n${heading}\n\n${a[key]}`)
  }
  lines.push('\n\n---\n\n# PARTIE B — PRÉSENTATION DE LA PRESTATION\n')
  const b = content.partie_b as Record<string, string>
  const bLabels: [string, string][] = [
    ['demarrage', '## 1. Démarrage du chantier'],
    ['interlocuteur', '## 2. Interlocuteur dédié'],
    ['qualite_ouvrages', '## 3. Qualité des ouvrages'],
    ['respect_planning', '## 4. Respect du planning'],
    ['securite', '## 5. Dispositions relatives à la sécurité'],
    ['dechets', '## 6. Traitement des déchets'],
    ['environnement', '## 7. Environnement'],
  ]
  for (const [key, heading] of bLabels) {
    if (b?.[key]) lines.push(`\n${heading}\n\n${b[key]}`)
  }
  lines.push('\n\n---\n\n# PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE\n')
  const c = content.partie_c as Record<string, string>
  const cLabels: [string, string][] = [
    ['methodologie', '## 1. Méthodologie détaillée'],
    ['effectifs', '## 2. Effectifs dédiés au chantier'],
    ['materiels', '## 3. Matériels dédiés'],
    ['hygiene_securite', '## 4. Hygiène et sécurité'],
    ['mesures_environnementales', '## 5. Mesures environnementales'],
    ['gpa', '## 6. Garantie de parfait achèvement (GPA)'],
    ['delai', '## 7. Délai de travaux'],
  ]
  for (const [key, heading] of cLabels) {
    if (c?.[key]) lines.push(`\n${heading}\n\n${c[key]}`)
  }
  return lines.join('\n')
}

// ─── Fullscreen editor ─────────────────────────────────────────────────────────

function FullscreenEditor({
  content, onSave, onClose, isSaving, saveSuccess,
}: {
  content: MemoireContent
  onSave: (raw: string) => void
  onClose: () => void
  isSaving: boolean
  saveSuccess: boolean
}) {
  const [raw, setRaw] = useState(() => buildFullMarkdown(content))

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#080B12' }}>
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(59,130,246,0.12)', background: 'rgba(15,23,42,0.80)', backdropFilter: 'blur(16px)' }}
      >
        <p className="text-sm font-medium text-ds-text">
          Édition du mémoire — format Markdown
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSave(raw)}
            disabled={isSaving}
            className="btn-primary flex items-center gap-2 py-2 px-4 text-sm"
          >
            {saveSuccess ? (
              <><CheckCircle2 size={14} style={{ color: '#34D399' }} />Sauvegardé</>
            ) : (
              <><Save size={14} />{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</>
            )}
          </button>
          <button onClick={onClose} className="btn-glass flex items-center gap-1.5 text-sm py-2 px-3">
            <X size={14} /> Fermer
          </button>
        </div>
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="flex-1 px-8 py-6 text-sm leading-relaxed resize-none focus:outline-none font-mono"
        style={{ background: '#080B12', color: '#E2E8F0', caretColor: '#3B82F6' }}
        spellCheck={false}
      />
    </div>
  )
}

// ─── Word export ──────────────────────────────────────────────────────────────

async function exportToWord(projectId: string, projectName: string) {
  const response = await api.get(`/projects/${projectId}/memoire/export-docx`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `Memoire_Technique_${projectName.replace(/\s+/g, '_')}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Profile summary card ────────────────────────────────────────────────────

function ProfileSummary({ stats }: { stats: { filled: number; total: number; nom_entreprise: string | null } | null }) {
  if (!stats) return null
  const pct = stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0
  const isComplete = stats.filled >= 14

  const MISSING_LABELS: Record<string, string> = {
    nom_entreprise: 'nom entreprise', historique: 'historique', activites: 'activités',
    postes_cles: 'équipe clé', chiffre_affaires: 'chiffre d\'affaires', materiel: 'matériel',
    vehicules: 'véhicules', moyens_informatiques: 'moyens informatiques',
    demarche_qualite: 'démarche qualité', gestion_securite: 'sécurité',
    mesures_environnementales: 'environnement', traitement_dechets: 'déchets',
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'rgba(12,17,30,0.55)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: isComplete ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}
        >
          <Building2 size={18} style={{ color: isComplete ? '#10B981' : '#F59E0B' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#E8ECF4' }}>
              Profil de votre entreprise
            </h3>
            {isComplete && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                Complet
              </span>
            )}
          </div>

          {isComplete ? (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
                {stats.nom_entreprise || 'Entreprise'}
              </span>
              <Link to="/memoire-config" className="text-xs hover:underline" style={{ color: '#60A5FA' }}>
                Modifier →
              </Link>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: pct < 30 ? '#F59E0B' : pct < 70 ? '#3B82F6' : '#10B981' }}
                  />
                </div>
                <span className="text-xs font-medium shrink-0" style={{ color: '#8B95A9' }}>
                  {stats.filled}/{stats.total}
                </span>
              </div>

              <p className="text-xs mt-2.5" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
                Complétez votre profil pour un mémoire personnalisé avec vos vraies informations (nom, équipe, références, matériel...)
              </p>

              {stats.filled < 10 && (
                <p className="text-[11px] mt-1.5" style={{ color: '#64748B' }}>
                  Il manque : {Object.values(MISSING_LABELS).slice(0, 6 - Math.min(stats.filled, 5)).join(', ')}...
                </p>
              )}

              <Link
                to="/memoire-config"
                className="inline-flex items-center gap-1.5 text-xs font-medium mt-3 px-3.5 py-1.5 rounded-lg transition-colors hover:bg-blue-500/20"
                style={{ color: '#60A5FA', border: '1px solid rgba(59,130,246,0.30)' }}
              >
                Compléter le profil →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Critères display ─────────────────────────────────────────────────────────

function CriteresCard({ criteres }: { criteres: CritereJugement[] }) {
  if (!criteres?.length) return null
  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{ background: 'rgba(12,17,30,0.55)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.12)' }}
        >
          <BarChart3 size={18} style={{ color: '#818CF8' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#E8ECF4' }}>
            Critères de jugement détectés
          </h3>
          <p className="text-[11px] mt-0.5" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
            Le mémoire sera optimisé pour maximiser votre note sur ces critères
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {criteres.map((c) => (
          <div key={c.nom} className="space-y-1">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#A78BFA' }}
            >
              {c.nom} — {c.poids}%
            </span>
            {c.sous_criteres?.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-2">
                {c.sous_criteres.map((sc) => (
                  <span key={sc.nom} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}>
                    {sc.nom} {sc.poids}%
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Structure preview ────────────────────────────────────────────────────────

function StructurePreview() {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <span className="flex items-center gap-2 text-ds-text-2">
          <Settings2 size={14} />
          Structure du mémoire généré
        </span>
        {open ? <ChevronUp size={14} className="text-ds-text-3" /> : <ChevronDown size={14} className="text-ds-text-3" />}
      </button>
      {open && (
        <div className="px-4 py-3 text-xs space-y-2" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="font-medium text-ds-text">Préambule</p>
          <p className="font-medium text-ds-text mt-2">Partie A — Présentation générale</p>
          <p className="text-ds-text-3 pl-3">Implantation, historique, activités, organigramme, équipe, moyens, références, fournisseurs</p>
          <p className="font-medium text-ds-text mt-2">Partie B — Présentation de la prestation</p>
          <p className="text-ds-text-3 pl-3">Démarrage, interlocuteur dédié, qualité, planning, sécurité, déchets, environnement</p>
          <p className="font-medium text-ds-text mt-2">Partie C — Méthodologie mise en œuvre</p>
          <p className="text-ds-text-3 pl-3">Méthodologie détaillée, effectifs, matériels, hygiène/sécurité, environnement, GPA, délais</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepMemoire({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { organization } = useAuthStore()
  const [showPaywall, setShowPaywall] = useState(false)
  const [variables, setVariables] = useState({
    nb_ouvriers: '',
    delai: '',
    chef_chantier_nom: '',
    chef_chantier_qualification: '',
    conducteur_travaux_nom: '',
    conducteur_travaux_qualification: '',
    materiel_specifique: '',
    particularites: '',
  })
  const [showForm, setShowForm] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editedContent, setEditedContent] = useState<MemoireContent | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [genSuccess, setGenSuccess] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Fetch existing mémoire
  const { data: memoire, isLoading } = useQuery({
    queryKey: ['memoire', project.id],
    queryFn: async () => {
      try {
        const { data } = await api.get<MemoireTechnique>(`/projects/${project.id}/memoire`)
        return data
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null
        throw err
      }
    },
    retry: false,
  })

  // Fetch profile stats
  const { data: profileStats } = useQuery({
    queryKey: ['memoire-config-stats'],
    queryFn: async () => {
      const { data } = await api.get<{ filled: number; total: number; nom_entreprise: string | null }>('/memoire-config/stats')
      return data
    },
  })

  const displayContent: MemoireContent | null = editedContent ?? memoire?.content_json ?? null
  const criteres = project.criteres_jugement ?? []

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      api.post<MemoireTechnique>(`/projects/${project.id}/memoire/generate`, {
        nb_ouvriers: variables.nb_ouvriers ? parseInt(variables.nb_ouvriers) : undefined,
        delai: variables.delai || undefined,
        chef_chantier_nom: variables.chef_chantier_nom || undefined,
        chef_chantier_qualification: variables.chef_chantier_qualification || undefined,
        conducteur_travaux_nom: variables.conducteur_travaux_nom || undefined,
        conducteur_travaux_qualification: variables.conducteur_travaux_qualification || undefined,
        materiel_specifique: variables.materiel_specifique || undefined,
        particularites: variables.particularites || undefined,
      }, { timeout: 600_000 }),
    onSuccess: (res) => {
      setGenError(null)
      setEditedContent(null)
      queryClient.setQueryData(['memoire', project.id], res.data)
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      setGenSuccess(true)
      setShowForm(false)
    },
    onError: (err) => {
      if (abortRef.current?.signal.aborted) return
      setGenSuccess(false)
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? 'Erreur lors de la génération')
        : 'Erreur lors de la génération'
      setGenError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const { mutate: saveEdits, isPending: isSaving } = useMutation({
    mutationFn: (content: MemoireContent) =>
      api.patch(`/projects/${project.id}/memoire`, { content_json: content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoire', project.id] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    },
  })

  const handleEditorSave = (raw: string) => {
    const parsed = parseMarkdownToContent(raw, displayContent!)
    setEditedContent(parsed)
    saveEdits(parsed)
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setGenError('Génération annulée.')
  }

  if (isLoading) {
    return (
      <div className="glass-card p-12 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#3B82F6' }} />
      </div>
    )
  }

  const hasMemoire = !!memoire

  return (
    <>
      <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" />

      {/* Generation overlay */}
      <AnalysisProgress
        isAnalyzing={isGenerating}
        isSuccess={genSuccess}
        onComplete={() => setGenSuccess(false)}
        onCancel={handleCancel}
        stages={MEMOIRE_STAGES}
        subtitle="Synorix IA rédige votre mémoire technique..."
      />

      {showEditor && displayContent && (
        <FullscreenEditor
          content={displayContent}
          onSave={handleEditorSave}
          onClose={() => setShowEditor(false)}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
        />
      )}

      <div className="glass-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ds-text">Étape 5 — Mémoire Technique</h2>
            <p className="text-sm text-ds-text-2 mt-1">
              {hasMemoire
                ? `v${memoire.version} — généré le ${new Date(memoire.generated_at).toLocaleDateString('fr-FR')}`
                : 'Générez un mémoire technique complet adapté à votre projet et optimisé pour les critères de jugement.'}
            </p>
          </div>
          {hasMemoire && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setIsExporting(true)
                  exportToWord(project.id, project.name).finally(() => setIsExporting(false))
                }}
                disabled={isExporting}
                className="btn-glass flex items-center gap-1.5 text-sm py-1.5 px-3"
              >
                <Download size={14} />
                {isExporting ? 'Export...' : 'Exporter Word'}
              </button>
              <button onClick={() => setShowEditor(true)} className="btn-glass flex items-center gap-1.5 text-sm py-1.5 px-3">
                <Pencil size={14} /> Modifier
              </button>
              <button onClick={() => setShowForm((v) => !v)} className="btn-glass flex items-center gap-1.5 text-sm py-1.5 px-3">
                <RotateCcw size={14} /> Regénérer
                {showForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          )}
        </div>

        {/* Generation form */}
        {(!hasMemoire || showForm) && (
          <div className="space-y-4">
            {/* 1. Critères de jugement (context from DCE) */}
            <CriteresCard criteres={criteres} />

            {/* 2. Profile summary */}
            <ProfileSummary stats={profileStats ?? null} />

            {/* 3. Chantier-specific form */}
            <div
              className="rounded-2xl p-5 space-y-5"
              style={{ background: 'rgba(12,17,30,0.55)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div>
                <h3 className="text-sm font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#E8ECF4' }}>
                  Informations spécifiques à ce chantier
                </h3>
                <p className="text-[11px] mt-1" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
                  Ces informations seront intégrées dans le mémoire pour ce projet
                </p>
              </div>

              {hasMemoire && (
                <p className="text-sm font-medium" style={{ color: '#FCD34D' }}>
                  La regénération remplacera le mémoire actuel.
                </p>
              )}

              {/* Row 1: Ouvriers + Délai */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text mb-1.5">
                    Nombre d&apos;ouvriers dédiés <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={variables.nb_ouvriers}
                    onChange={(e) => setVariables((v) => ({ ...v, nb_ouvriers: e.target.value }))}
                    className="glass-input w-full py-2.5 text-sm"
                    placeholder="Ex: 4"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text mb-1.5">
                    Délai estimé <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={variables.delai}
                    onChange={(e) => setVariables((v) => ({ ...v, delai: e.target.value }))}
                    className="glass-input w-full py-2.5 text-sm"
                    placeholder="Ex: 3 mois"
                  />
                </div>
              </div>

              {/* Row 2: Chef de chantier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text mb-1.5">Chef de chantier — nom</label>
                  <input
                    type="text"
                    value={variables.chef_chantier_nom}
                    onChange={(e) => setVariables((v) => ({ ...v, chef_chantier_nom: e.target.value }))}
                    className="glass-input w-full py-2.5 text-sm"
                    placeholder="Ex: Jean Dupont"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text mb-1.5">Qualification</label>
                  <input
                    type="text"
                    value={variables.chef_chantier_qualification}
                    onChange={(e) => setVariables((v) => ({ ...v, chef_chantier_qualification: e.target.value }))}
                    className="glass-input w-full py-2.5 text-sm"
                    placeholder="Ex: 15 ans d'expérience, CACES R482"
                  />
                </div>
              </div>

              {/* Row 3: Conducteur de travaux */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text mb-1.5">Conducteur de travaux — nom</label>
                  <input
                    type="text"
                    value={variables.conducteur_travaux_nom}
                    onChange={(e) => setVariables((v) => ({ ...v, conducteur_travaux_nom: e.target.value }))}
                    className="glass-input w-full py-2.5 text-sm"
                    placeholder="Ex: Marie Martin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text mb-1.5">Qualification</label>
                  <input
                    type="text"
                    value={variables.conducteur_travaux_qualification}
                    onChange={(e) => setVariables((v) => ({ ...v, conducteur_travaux_qualification: e.target.value }))}
                    className="glass-input w-full py-2.5 text-sm"
                    placeholder="Ex: Ingénieur BTP, 10 ans ITE/ravalement"
                  />
                </div>
              </div>

              {/* Row 4: Matériel spécifique */}
              <div>
                <label className="block text-sm font-medium text-ds-text mb-1.5">
                  Matériel spécifique au chantier
                </label>
                <textarea
                  value={variables.materiel_specifique}
                  onChange={(e) => setVariables((v) => ({ ...v, materiel_specifique: e.target.value }))}
                  rows={2}
                  className="glass-input w-full py-2.5 text-sm resize-none"
                  placeholder="Ex: échafaudage tubulaire R200, nacelle articulée 20m, benne 15m³..."
                />
              </div>

              {/* Row 5: Contraintes */}
              <div>
                <label className="block text-sm font-medium text-ds-text mb-1.5">
                  Contraintes particulières
                  <span className="text-ds-text-3 font-normal ml-1">(optionnel)</span>
                </label>
                <textarea
                  value={variables.particularites}
                  onChange={(e) => setVariables((v) => ({ ...v, particularites: e.target.value }))}
                  rows={2}
                  className="glass-input w-full py-2.5 text-sm resize-none"
                  placeholder="Ex: site occupé, horaires restreints 8h-17h, accès limité rue piétonne..."
                />
              </div>
            </div>

            {/* 4. Structure preview */}
            <StructurePreview />

            {/* Error */}
            {genError && (
              <p
                className="text-sm rounded-lg px-3 py-2"
                style={{ color: '#F87171', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                {genError}
              </p>
            )}

            {/* 5. Generate button */}
            <button
              onClick={() => {
                const plan = organization?.plan ?? 'free'
                if (plan === 'free') { setShowPaywall(true); return }
                setGenError(null)
                generate()
              }}
              disabled={isGenerating || !variables.nb_ouvriers || !variables.delai}
              className="btn-primary flex items-center gap-2 py-3 px-6 disabled:opacity-40"
            >
              <Sparkles size={18} />
              {hasMemoire ? 'Regénérer le mémoire' : 'Générer le mémoire technique'}
            </button>
          </div>
        )}

        {/* Document view */}
        {hasMemoire && !showForm && displayContent && (
          <DocumentView content={displayContent} project={project} />
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={() => navigate(`/projects/${project.id}/export`)}
            disabled={!hasMemoire}
            className="btn-primary px-6 py-2.5"
          >
            Vérification finale →
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Document view ─────────────────────────────────────────────────────────────

function DocumentView({ content, project }: { content: MemoireContent; project: Project }) {
  const a = content.partie_a as Record<string, string>
  const b = content.partie_b as Record<string, string>
  const c = content.partie_c as Record<string, string>

  const partAItems: [string, string][] = [
    ['implantation', '1. Implantation géographique'], ['historique', '2. Historique'],
    ['engagement_qualitatif', '3. Engagement qualitatif'], ['activites', '4. Nos activités'],
    ['organigramme', '5. Organigramme'], ['roles_missions', "6. Rôles et missions de l'équipe d'encadrement"],
    ['moyens_informatiques', '7. Moyens informatiques'], ['vehicules', '8. Véhicules'],
    ['materiel', '9. Matériel'], ['references', '10. Références chantiers'], ['fournisseurs', '11. Fournisseurs'],
  ]
  const partBItems: [string, string][] = [
    ['demarrage', '1. Démarrage du chantier'], ['interlocuteur', '2. Interlocuteur dédié'],
    ['qualite_ouvrages', '3. Qualité des ouvrages'], ['respect_planning', '4. Respect du planning'],
    ['securite', '5. Dispositions relatives à la sécurité'], ['dechets', '6. Traitement des déchets'],
    ['environnement', '7. Environnement'],
  ]
  const partCItems: [string, string][] = [
    ['methodologie', '1. Méthodologie détaillée'], ['effectifs', '2. Effectifs dédiés au chantier'],
    ['materiels', '3. Matériels dédiés'], ['hygiene_securite', '4. Hygiène et sécurité'],
    ['mesures_environnementales', '5. Mesures environnementales'],
    ['gpa', '6. Garantie de parfait achèvement (GPA)'], ['delai', '7. Délai de travaux'],
  ]

  return (
    <div
      className="max-h-[75vh] overflow-y-auto rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(59,130,246,0.08)' }}
    >
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
        <div className="text-center pb-6" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <p className="text-xs uppercase tracking-widest text-ds-text-3 mb-2 font-mono">Mémoire Technique</p>
          <h1 className="text-2xl font-bold text-ds-text">{project.name}</h1>
          {project.maitre_ouvrage && <p className="text-sm text-ds-text-2 mt-1">{project.maitre_ouvrage}</p>}
        </div>
        <DocSection title="PRÉAMBULE" level="part"><MdContent text={content.preambule ?? ''} /></DocSection>
        <div className="space-y-6">
          <PartHeading>PARTIE A — PRÉSENTATION GÉNÉRALE</PartHeading>
          {partAItems.map(([key, label]) => a?.[key] ? <DocSection key={key} title={label} level="section"><MdContent text={a[key]} /></DocSection> : null)}
        </div>
        <div className="space-y-6">
          <PartHeading>PARTIE B — PRÉSENTATION DE LA PRESTATION</PartHeading>
          {partBItems.map(([key, label]) => b?.[key] ? <DocSection key={key} title={label} level="section"><MdContent text={b[key]} /></DocSection> : null)}
        </div>
        <div className="space-y-6">
          <PartHeading>PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE</PartHeading>
          {partCItems.map(([key, label]) => c?.[key] ? <DocSection key={key} title={label} level="section"><MdContent text={c[key]} /></DocSection> : null)}
        </div>
      </div>
    </div>
  )
}

function PartHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-ds-text uppercase tracking-wide pb-2" style={{ borderBottom: '2px solid #3B82F6' }}>
      {children}
    </h2>
  )
}

function DocSection({ title, level, children }: { title: string; level: 'part' | 'section'; children: React.ReactNode }) {
  return (
    <div>
      {level === 'part' ? <PartHeading>{title}</PartHeading> : <h3 className="text-sm font-semibold text-ds-text mb-2">{title}</h3>}
      {children}
    </div>
  )
}

function MdContent({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none prose-headings:text-ds-text prose-headings:font-semibold prose-strong:text-white prose-strong:font-semibold prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-300 prose-ul:text-slate-300">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  )
}

// ─── Parse markdown → MemoireContent ──────────────────────────────────────────

function parseMarkdownToContent(raw: string, original: MemoireContent): MemoireContent {
  const KEY_MAP: Record<string, { part: keyof MemoireContent | 'preambule'; key?: string }> = {
    'PRÉAMBULE':                                    { part: 'preambule' },
    'Implantation géographique':                    { part: 'partie_a', key: 'implantation' },
    'Historique':                                   { part: 'partie_a', key: 'historique' },
    'Engagement qualitatif':                        { part: 'partie_a', key: 'engagement_qualitatif' },
    'Nos activités':                                { part: 'partie_a', key: 'activites' },
    'Organigramme':                                 { part: 'partie_a', key: 'organigramme' },
    "Rôles et missions de l'équipe d'encadrement":  { part: 'partie_a', key: 'roles_missions' },
    'Moyens informatiques':                         { part: 'partie_a', key: 'moyens_informatiques' },
    'Véhicules':                                    { part: 'partie_a', key: 'vehicules' },
    'Matériel':                                     { part: 'partie_a', key: 'materiel' },
    'Références chantiers':                         { part: 'partie_a', key: 'references' },
    'Fournisseurs':                                 { part: 'partie_a', key: 'fournisseurs' },
    'Démarrage du chantier':                        { part: 'partie_b', key: 'demarrage' },
    'Interlocuteur dédié':                          { part: 'partie_b', key: 'interlocuteur' },
    'Qualité des ouvrages':                         { part: 'partie_b', key: 'qualite_ouvrages' },
    'Respect du planning':                          { part: 'partie_b', key: 'respect_planning' },
    'Dispositions relatives à la sécurité':         { part: 'partie_b', key: 'securite' },
    'Traitement des déchets':                       { part: 'partie_b', key: 'dechets' },
    'Environnement':                                { part: 'partie_b', key: 'environnement' },
    'Méthodologie détaillée':                       { part: 'partie_c', key: 'methodologie' },
    'Effectifs dédiés au chantier':                 { part: 'partie_c', key: 'effectifs' },
    'Matériels dédiés':                             { part: 'partie_c', key: 'materiels' },
    'Hygiène et sécurité':                          { part: 'partie_c', key: 'hygiene_securite' },
    'Mesures environnementales':                    { part: 'partie_c', key: 'mesures_environnementales' },
    'Garantie de parfait achèvement (GPA)':         { part: 'partie_c', key: 'gpa' },
    'Délai de travaux':                             { part: 'partie_c', key: 'delai' },
  }

  const lines = raw.split('\n')
  const result: MemoireContent = {
    preambule: original.preambule,
    partie_a: { ...original.partie_a },
    partie_b: { ...original.partie_b },
    partie_c: { ...original.partie_c },
  }

  let currentMapping: { part: keyof MemoireContent | 'preambule'; key?: string } | null = null
  let buffer: string[] = []

  const flush = () => {
    if (!currentMapping) return
    const text = buffer.join('\n').trim()
    if (currentMapping.part === 'preambule') {
      result.preambule = text
    } else if (currentMapping.key) {
      const partObj = result[currentMapping.part] as Record<string, string>
      partObj[currentMapping.key] = text
    }
    buffer = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/^\d+\.\s+/, '').trim()
      const mapping = Object.entries(KEY_MAP).find(([k]) => headingText === k || headingText.endsWith(k))
      if (mapping) { flush(); currentMapping = mapping[1]; continue }
      if (headingText.startsWith('PARTIE') || headingText === 'PRÉAMBULE') {
        flush()
        const direct = KEY_MAP[headingText]
        currentMapping = direct ?? null
        continue
      }
    }
    if (currentMapping) buffer.push(line)
  }
  flush()
  return result
}
