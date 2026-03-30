import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Save, RotateCcw, CheckCircle2, ChevronDown, ChevronUp,
  Pencil, X, Download,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import axios from 'axios'
import { api } from '@/services/api'
import { AnalysisProgress, MEMOIRE_STAGES } from '@/components/project/AnalysisProgress'
import type { Project, MemoireTechnique, MemoireContent } from '@/types'

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
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(14,165,233,0.12)', background: 'rgba(15,23,42,0.80)', backdropFilter: 'blur(16px)' }}
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
          <button
            onClick={onClose}
            className="btn-glass flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <X size={14} /> Fermer
          </button>
        </div>
      </div>
      {/* Editor */}
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="flex-1 px-8 py-6 text-sm leading-relaxed resize-none focus:outline-none font-mono"
        style={{ background: '#080B12', color: '#E2E8F0', caretColor: '#0EA5E9' }}
        spellCheck={false}
      />
    </div>
  )
}

// ─── Word export (backend) ────────────────────────────────────────────────────

async function exportToWord(projectId: string, projectName: string) {
  const response = await api.get(`/projects/${projectId}/memoire/export-docx`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `Memoire_Technique_${projectName.replace(/\s+/g, '_')}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepMemoire({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [variables, setVariables] = useState({ nb_ouvriers: '', delai: '', particularites: '' })
  const [showForm, setShowForm] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editedContent, setEditedContent] = useState<MemoireContent | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [genSuccess, setGenSuccess] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

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

  const displayContent: MemoireContent | null = editedContent ?? memoire?.content_json ?? null

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      api.post<MemoireTechnique>(`/projects/${project.id}/memoire/generate`, {
        nb_ouvriers:   variables.nb_ouvriers ? parseInt(variables.nb_ouvriers) : undefined,
        delai:         variables.delai || undefined,
        particularites:variables.particularites || undefined,
      }),
    onSuccess: (res) => {
      setGenError(null)
      setEditedContent(null)
      queryClient.setQueryData(['memoire', project.id], res.data)
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      setGenSuccess(true)
      setShowForm(false)
    },
    onError: (err) => {
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

  if (isLoading) {
    return (
      <div className="glass-card p-12 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#0EA5E9' }} />
      </div>
    )
  }

  const hasMemoire = !!memoire

  return (
    <>
      <AnalysisProgress
        isAnalyzing={isGenerating}
        isSuccess={genSuccess}
        onComplete={() => { setGenSuccess(false) }}
        stages={MEMOIRE_STAGES}
        subtitle="Claude Opus rédige votre mémoire technique (~2-3 min)..."
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

      <div className="glass-card p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ds-text">Étape 5 — Mémoire Technique</h2>
            <p className="text-sm text-ds-text-2 mt-1">
              {hasMemoire
                ? `v${memoire.version} — généré le ${new Date(memoire.generated_at).toLocaleDateString('fr-FR')}`
                : 'Générez un mémoire technique complet (~20 pages) adapté à votre projet.'}
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
              <button
                onClick={() => setShowEditor(true)}
                className="btn-glass flex items-center gap-1.5 text-sm py-1.5 px-3"
              >
                <Pencil size={14} />
                Modifier
              </button>
              <button
                onClick={() => setShowForm((v) => !v)}
                className="btn-glass flex items-center gap-1.5 text-sm py-1.5 px-3"
              >
                <RotateCcw size={14} />
                Regénérer
                {showForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          )}
        </div>

        {/* Generation form */}
        {(!hasMemoire || showForm) && (
          <div
            className="space-y-5 rounded-xl p-5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(14,165,233,0.12)' }}
          >
            {hasMemoire && (
              <p className="text-sm font-medium" style={{ color: '#FCD34D' }}>
                ⚠️ La regénération remplacera le mémoire actuel.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ds-text mb-1.5">Nombre d&apos;ouvriers dédiés</label>
                <input
                  type="number"
                  value={variables.nb_ouvriers}
                  onChange={(e) => setVariables((v) => ({ ...v, nb_ouvriers: e.target.value }))}
                  className="input-dark"
                  placeholder="Ex: 4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text mb-1.5">Délai estimé</label>
                <input
                  type="text"
                  value={variables.delai}
                  onChange={(e) => setVariables((v) => ({ ...v, delai: e.target.value }))}
                  className="input-dark"
                  placeholder="Ex: 3 mois"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ds-text mb-1.5">
                Particularités techniques
                <span className="text-ds-text-3 font-normal ml-1">(optionnel)</span>
              </label>
              <textarea
                value={variables.particularites}
                onChange={(e) => setVariables((v) => ({ ...v, particularites: e.target.value }))}
                rows={3}
                className="input-dark resize-none"
                placeholder="Éléments spécifiques à mentionner dans le mémoire..."
              />
            </div>
            {genError && (
              <p
                className="text-sm rounded-lg px-3 py-2"
                style={{ color: '#F87171', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                {genError}
              </p>
            )}
            <button
              onClick={() => { setGenError(null); generate() }}
              disabled={isGenerating}
              className="btn-primary flex items-center gap-2 py-3 px-6"
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
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(14,165,233,0.08)' }}
    >
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">

        {/* Cover */}
        <div
          className="text-center pb-6"
          style={{ borderBottom: '1px solid rgba(14,165,233,0.12)' }}
        >
          <p className="text-xs uppercase tracking-widest text-ds-text-3 mb-2 font-mono">Mémoire Technique</p>
          <h1 className="text-2xl font-bold text-ds-text">{project.name}</h1>
          {project.maitre_ouvrage && (
            <p className="text-sm text-ds-text-2 mt-1">{project.maitre_ouvrage}</p>
          )}
        </div>

        {/* Préambule */}
        <DocSection title="PRÉAMBULE" level="part">
          <MdContent text={content.preambule ?? ''} />
        </DocSection>

        {/* Partie A */}
        <div className="space-y-6">
          <PartHeading>PARTIE A — PRÉSENTATION GÉNÉRALE</PartHeading>
          {partAItems.map(([key, label]) =>
            a?.[key] ? <DocSection key={key} title={label} level="section"><MdContent text={a[key]} /></DocSection> : null
          )}
        </div>

        {/* Partie B */}
        <div className="space-y-6">
          <PartHeading>PARTIE B — PRÉSENTATION DE LA PRESTATION</PartHeading>
          {partBItems.map(([key, label]) =>
            b?.[key] ? <DocSection key={key} title={label} level="section"><MdContent text={b[key]} /></DocSection> : null
          )}
        </div>

        {/* Partie C */}
        <div className="space-y-6">
          <PartHeading>PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE</PartHeading>
          {partCItems.map(([key, label]) =>
            c?.[key] ? <DocSection key={key} title={label} level="section"><MdContent text={c[key]} /></DocSection> : null
          )}
        </div>
      </div>
    </div>
  )
}

function PartHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-sm font-bold text-ds-text uppercase tracking-wide pb-2"
      style={{ borderBottom: '2px solid #0EA5E9' }}
    >
      {children}
    </h2>
  )
}

function DocSection({ title, level, children }: { title: string; level: 'part' | 'section'; children: React.ReactNode }) {
  return (
    <div>
      {level === 'part' ? (
        <PartHeading>{title}</PartHeading>
      ) : (
        <h3 className="text-sm font-semibold text-ds-text mb-2">{title}</h3>
      )}
      {children}
    </div>
  )
}

function MdContent({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none
      prose-headings:text-ds-text prose-headings:font-semibold
      prose-strong:text-white prose-strong:font-semibold
      prose-p:text-slate-300 prose-p:leading-relaxed
      prose-li:text-slate-300 prose-ul:text-slate-300">
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
