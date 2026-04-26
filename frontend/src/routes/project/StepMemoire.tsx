import { useState, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  Sparkles, Save, CheckCircle2, ChevronDown,
  Pencil, X, Download, Building2, BarChart3,
  ChevronRight, Zap, Eye, MessageSquare, Shield,
  Loader2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import axios from 'axios'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { PipelineProgress } from '@/components/project/PipelineProgress'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import type { Project, MemoireTechnique, MemoireContent, CritereJugement } from '@/types'

const F = "'DM Sans', sans-serif"

// ─── Section definitions for TOC ─────────────────────────────────────────────

interface TocSection {
  id: string
  label: string
  part: keyof MemoireContent | 'preambule'
  key?: string
  children?: TocSection[]
}

const TOC_STRUCTURE: TocSection[] = [
  {
    id: 'preambule', label: 'Préambule', part: 'preambule',
    children: [
      { id: 'preambule-intro', label: 'Introduction', part: 'preambule' },
      { id: 'preambule-contexte', label: 'Contexte du projet', part: 'preambule' },
    ],
  },
  {
    id: 'partie-a', label: 'Partie A : Présentation', part: 'partie_a',
    children: [
      { id: 'sec-implantation', label: "L'entreprise", part: 'partie_a', key: 'implantation' },
      { id: 'sec-organigramme', label: 'Moyens humains', part: 'partie_a', key: 'organigramme' },
      { id: 'sec-materiel', label: 'Moyens matériels', part: 'partie_a', key: 'materiel' },
    ],
  },
  {
    id: 'partie-b', label: 'Partie B : Prestation', part: 'partie_b',
    children: [
      { id: 'sec-demarrage', label: 'Compréhension du besoin', part: 'partie_b', key: 'demarrage' },
      { id: 'sec-respect_planning', label: 'Organisation du chantier', part: 'partie_b', key: 'respect_planning' },
    ],
  },
  {
    id: 'partie-c', label: 'Partie C : Méthodologie', part: 'partie_c',
    children: [
      { id: 'sec-methodologie', label: 'Phasage des travaux', part: 'partie_c', key: 'methodologie' },
      { id: 'sec-mesures_environnementales', label: 'Gestion des nuisances', part: 'partie_c', key: 'mesures_environnementales' },
      { id: 'sec-hygiene_securite', label: 'Qualité & Environnement', part: 'partie_c', key: 'hygiene_securite' },
    ],
  },
  {
    id: 'annexes', label: 'Annexes', part: 'partie_a',
    children: [
      { id: 'sec-engagement_qualitatif', label: 'Certifications', part: 'partie_a', key: 'engagement_qualitatif' },
      { id: 'sec-references', label: 'Références similaires', part: 'partie_a', key: 'references' },
    ],
  },
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#FFFFFF', fontFamily: F }}>
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}
      >
        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
          Edition du memoire — format Markdown
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSave(raw)}
            disabled={isSaving}
            className="flex items-center gap-2 py-2 px-4 text-sm font-bold text-white rounded-lg transition-colors"
            style={{ background: '#0EA5E9' }}
          >
            {saveSuccess ? (
              <><CheckCircle2 size={14} style={{ color: '#BBF7D0' }} />Sauvegardé</>
            ) : (
              <><Save size={14} />{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</>
            )}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-lg transition-colors hover:bg-slate-50"
            style={{ color: '#64748B', border: '1px solid #E2E8F0' }}
          >
            <X size={14} /> Fermer
          </button>
        </div>
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="flex-1 px-8 py-6 text-sm leading-relaxed resize-none focus:outline-none font-mono"
        style={{ background: '#FFFFFF', color: '#0F172A', caretColor: '#0EA5E9' }}
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

  return (
    <div
      className="bg-white rounded-xl p-5"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: isComplete ? 'rgba(14,165,233,0.10)' : 'rgba(100,116,139,0.08)' }}
        >
          <Building2 size={18} style={{ color: isComplete ? '#0EA5E9' : '#64748B' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold" style={{ color: '#0F172A', fontFamily: F }}>
              Profil de votre entreprise
            </h3>
            {isComplete && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(14,165,233,0.10)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.20)' }}
              >
                Complet
              </span>
            )}
          </div>

          {isComplete ? (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm" style={{ color: '#64748B' }}>{stats.nom_entreprise || 'Entreprise'}</span>
              <Link to="/memoire-config" className="text-xs hover:underline" style={{ color: '#0EA5E9' }}>
                Modifier →
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: pct < 30 ? '#64748B' : pct < 70 ? '#0EA5E9' : '#0EA5E9' }}
                  />
                </div>
                <span className="text-xs font-medium shrink-0" style={{ color: '#64748B' }}>
                  {stats.filled}/{stats.total}
                </span>
              </div>
              <p className="text-xs mt-2.5" style={{ color: '#64748B' }}>
                Completez votre profil pour un memoire personnalise avec vos vraies informations.
              </p>
              <Link
                to="/memoire-config"
                className="inline-flex items-center gap-1.5 text-xs font-medium mt-3 px-3.5 py-1.5 rounded-lg transition-colors hover:bg-sky-50"
                style={{ border: '1px solid #0EA5E9', color: '#0EA5E9' }}
              >
                Completer le profil →
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
      className="bg-white rounded-xl p-5 space-y-3"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.10)' }}
        >
          <BarChart3 size={18} style={{ color: '#818CF8' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A', fontFamily: F }}>
            Criteres de jugement detectes
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>
            Le memoire sera optimise pour maximiser votre note sur ces criteres
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {criteres.map((c) => (
          <div key={c.nom} className="space-y-1">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(99,102,241,0.10)', color: '#818CF8' }}
            >
              {c.nom} — {c.poids}%
            </span>
            {c.sous_criteres?.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-2">
                {c.sous_criteres.map((sc) => (
                  <span key={sc.nom} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F1F5F9', color: '#94A3B8' }}>
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

// ─── AI Suggestion Card (right column) ───────────────────────────────────────

interface AiSuggestion {
  id: string
  icon: typeof Sparkles
  title: string
  description: string
}

const DEFAULT_SUGGESTIONS: AiSuggestion[] = [
  {
    id: 'sug-refs',
    icon: Sparkles,
    title: 'Optimisation des references',
    description: "Vous n'avez cite que 2 projets similaires. L'ajout d'une reference en genie civil renforcerait votre note technique.",
  },
  {
    id: 'sug-env',
    icon: Zap,
    title: 'Risque Environnemental',
    description: "Le paragraphe sur la gestion des dechets est trop generique. Voulez-vous que je l'adapte aux normes ISO 14001 ?",
  },
  {
    id: 'sug-gantt',
    icon: Eye,
    title: 'Clarte du phasage',
    description: 'Le texte suggere un chevauchement complexe en semaine 4. Ajouter un diagramme GANTT pourrait clarifier ce point.',
  },
]

function SuggestionCard({
  suggestion, onDismiss,
}: {
  suggestion: AiSuggestion
  onDismiss: (id: string) => void
}) {
  const Icon = suggestion.icon
  return (
    <div
      className="bg-white rounded-xl p-4 relative"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <button
        onClick={() => onDismiss(suggestion.id)}
        className="absolute top-3 right-3 p-0.5 rounded transition-colors hover:bg-slate-100"
        style={{ color: '#CBD5E1' }}
      >
        <X size={12} />
      </button>
      <div className="flex items-start gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(14,165,233,0.10)' }}
        >
          <Icon size={14} style={{ color: '#0EA5E9' }} />
        </div>
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-sm font-bold" style={{ color: '#0F172A', fontFamily: F }}>
            {suggestion.title}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#64748B' }}>
            {suggestion.description}
          </p>
          <button
            className="mt-3 text-xs font-bold px-4 py-1.5 rounded-lg text-white transition-colors hover:opacity-90"
            style={{ background: '#0EA5E9' }}
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TOC Sidebar ─────────────────────────────────────────────────────────────

function TocSidebar({
  activeSection, onNavigate, completionPct,
}: {
  activeSection: string
  onNavigate: (id: string) => void
  completionPct: number
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(TOC_STRUCTURE.map((s) => s.id)),
  )

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div
      className="bg-white rounded-xl p-4 sticky top-4"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', width: 220 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: '#0F172A', fontFamily: F }}>
          Sommaire du document
        </h3>
        <span className="text-xs font-medium" style={{ color: '#0EA5E9' }}>
          {completionPct}% Complet
        </span>
      </div>

      <nav className="space-y-1">
        {TOC_STRUCTURE.map((section) => {
          const isOpen = expandedSections.has(section.id)
          const isActive = activeSection === section.id
          return (
            <div key={section.id}>
              <button
                onClick={() => {
                  toggleSection(section.id)
                  onNavigate(section.id)
                }}
                className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-left transition-colors hover:bg-slate-50"
                style={{
                  borderLeft: isActive ? '2px solid #0EA5E9' : '2px solid transparent',
                }}
              >
                {section.children ? (
                  isOpen
                    ? <ChevronDown size={12} style={{ color: '#94A3B8' }} />
                    : <ChevronRight size={12} style={{ color: '#94A3B8' }} />
                ) : <span style={{ width: 12 }} />}
                <span
                  className="text-sm font-semibold"
                  style={{ color: isActive ? '#0EA5E9' : '#1E293B', fontFamily: F }}
                >
                  {section.label}
                </span>
              </button>
              {section.children && isOpen && (
                <div className="ml-2 space-y-0.5">
                  {section.children.map((child) => {
                    const isChildActive = activeSection === child.id
                    return (
                      <button
                        key={child.id}
                        onClick={() => onNavigate(child.id)}
                        className="w-full text-left py-1 px-4 text-xs transition-colors hover:text-cyan-500"
                        style={{
                          color: isChildActive ? '#0EA5E9' : '#64748B',
                          fontWeight: isChildActive ? 600 : 400,
                          borderLeft: isChildActive ? '2px solid #0EA5E9' : '2px solid transparent',
                          fontFamily: F,
                        }}
                      >
                        {child.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

// ─── Document View (center column — "Word page" style) ───────────────────────

function DocumentView({
  content, project, docRef,
}: {
  content: MemoireContent
  project: Project
  docRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const a = content.partie_a as Record<string, string>
  const b = content.partie_b as Record<string, string>
  const c = content.partie_c as Record<string, string>

  const partAItems: [string, string][] = [
    ['implantation', '1. Implantation geographique'], ['historique', '2. Historique'],
    ['engagement_qualitatif', '3. Engagement qualitatif'], ['activites', '4. Nos activites'],
    ['organigramme', '5. Organigramme'], ['roles_missions', "6. Roles et missions de l'equipe d'encadrement"],
    ['moyens_informatiques', '7. Moyens informatiques'], ['vehicules', '8. Vehicules'],
    ['materiel', '9. Materiel'], ['references', '10. References chantiers'], ['fournisseurs', '11. Fournisseurs'],
  ]
  const partBItems: [string, string][] = [
    ['demarrage', '1. Demarrage du chantier'], ['interlocuteur', '2. Interlocuteur dedie'],
    ['qualite_ouvrages', '3. Qualite des ouvrages'], ['respect_planning', '4. Respect du planning'],
    ['securite', '5. Dispositions relatives a la securite'], ['dechets', '6. Traitement des dechets'],
    ['environnement', '7. Environnement'],
  ]
  const partCItems: [string, string][] = [
    ['methodologie', '1. Methodologie detaillee'], ['effectifs', '2. Effectifs dedies au chantier'],
    ['materiels', '3. Materiels dedies'], ['hygiene_securite', '4. Hygiene et securite'],
    ['mesures_environnementales', '5. Mesures environnementales'],
    ['gpa', '6. Garantie de parfait achevement (GPA)'], ['delai', '7. Delai de travaux'],
  ]

  return (
    <div
      ref={docRef}
      className="bg-white rounded-xl overflow-y-auto"
      style={{
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        maxHeight: 'calc(100vh - 200px)',
      }}
    >
      <div className="max-w-3xl mx-auto py-10 px-10 space-y-8" style={{ fontFamily: F }}>

        {/* Document header */}
        <div className="flex items-start justify-between pb-6" style={{ borderBottom: '2px solid #0EA5E9' }}>
          <div
            className="w-24 h-12 rounded-lg flex items-center justify-center text-xs font-medium"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#94A3B8' }}
          >
            LOGO
          </div>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: '#0EA5E9' }}>
              MEMOIRE JUSTIFICATIF
            </p>
            <p className="text-sm mt-1" style={{ color: '#334155' }}>{project.name}</p>
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
              Reference : MT-SYN-{new Date().getFullYear()}-001
            </p>
          </div>
        </div>

        {/* PRÉAMBULE */}
        <div id="preambule">
          <PartHeading>PREAMBULE</PartHeading>
          <div id="preambule-intro" />
          <div id="preambule-contexte" />
          <MdContent text={content.preambule ?? ''} />
        </div>

        {/* PARTIE A */}
        <div id="partie-a">
          <PartHeading>PARTIE A — PRESENTATION GENERALE</PartHeading>
          {partAItems.map(([key, label]) =>
            a?.[key] ? (
              <div key={key} id={`sec-${key}`} className="mt-6">
                <SectionHeading>{label}</SectionHeading>
                <MdContent text={a[key]} />
              </div>
            ) : null,
          )}
        </div>

        {/* PARTIE B */}
        <div id="partie-b">
          <PartHeading>PARTIE B — PRESENTATION DE LA PRESTATION</PartHeading>
          {partBItems.map(([key, label]) =>
            b?.[key] ? (
              <div key={key} id={`sec-${key}`} className="mt-6">
                <SectionHeading>{label}</SectionHeading>
                <MdContent text={b[key]} />
              </div>
            ) : null,
          )}
        </div>

        {/* PARTIE C */}
        <div id="partie-c">
          <PartHeading>PARTIE C — METHODOLOGIE MISE EN OEUVRE</PartHeading>
          {partCItems.map(([key, label]) =>
            c?.[key] ? (
              <div key={key} id={`sec-${key}`} className="mt-6">
                <SectionHeading>{label}</SectionHeading>
                <MdContent text={c[key]} />
              </div>
            ) : null,
          )}
        </div>

        {/* Annexes */}
        <div id="annexes">
          <PartHeading>ANNEXES</PartHeading>
          {a?.engagement_qualitatif && (
            <div id="sec-engagement_qualitatif" className="mt-6">
              <SectionHeading>Certifications</SectionHeading>
              <MdContent text={a.engagement_qualitatif} />
            </div>
          )}
          {a?.references && (
            <div id="sec-references" className="mt-6">
              <SectionHeading>References similaires</SectionHeading>
              <MdContent text={a.references} />
            </div>
          )}
        </div>

        {/* Document footer */}
        <div
          className="flex items-center justify-between pt-6 mt-8"
          style={{ borderTop: '1px solid #E2E8F0' }}
        >
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Synorix BTP SaaS — Page 1
          </p>
          <div className="flex items-center gap-1.5">
            <Shield size={12} style={{ color: '#0EA5E9' }} />
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Signe numeriquement via Synorix Trust
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PartHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xl font-bold pb-2 mb-4"
      style={{
        color: '#0F172A',
        borderLeft: '3px solid #0EA5E9',
        paddingLeft: 12,
        fontFamily: F,
      }}
    >
      {children}
    </h2>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold mb-2" style={{ color: '#0EA5E9', fontFamily: F }}>
      {children}
    </h3>
  )
}

function MdContent({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-p:leading-relaxed"
      style={{ color: '#334155', fontFamily: F }}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
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
  const [, setGenSuccess] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState('preambule')
  const abortRef = useRef<AbortController | null>(null)
  const docRef = useRef<HTMLDivElement | null>(null)

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

  // Compute completion % for the TOC badge
  const completionPct = useMemo(() => {
    if (!displayContent) return 0
    const allSections: string[] = []
    const a = displayContent.partie_a as Record<string, string>
    const b = displayContent.partie_b as Record<string, string>
    const c = displayContent.partie_c as Record<string, string>
    const parts = [a, b, c]
    for (const part of parts) {
      if (!part) continue
      for (const val of Object.values(part)) allSections.push(val)
    }
    if (displayContent.preambule) allSections.push(displayContent.preambule)
    const filled = allSections.filter((v) => v && v.trim().length > 10).length
    return allSections.length > 0 ? Math.round((filled / allSections.length) * 100) : 0
  }, [displayContent])

  const visibleSuggestions = useMemo(
    () => DEFAULT_SUGGESTIONS.filter((s) => !dismissedSuggestions.has(s.id)),
    [dismissedSuggestions],
  )

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
        ? (err.response?.data?.detail ?? 'Erreur lors de la generation')
        : 'Erreur lors de la generation'
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
    setGenError('Generation annulee.')
  }

  const handleTocNavigate = useCallback((sectionId: string) => {
    setActiveSection(sectionId)
    const el = document.getElementById(sectionId)
    if (el && docRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // ── Loading ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-xl p-12 flex flex-col items-center gap-3"
        style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <Loader2 size={32} className="animate-spin" style={{ color: '#0EA5E9' }} />
        <p className="font-medium" style={{ color: '#0F172A', fontFamily: F }}>
          Chargement du memoire...
        </p>
      </div>
    )
  }

  const hasMemoire = !!memoire
  const lotName = project.selected_lot_name || 'Lot unique'

  // ── Bottom bar ──────────────────────────────────────────────────

  const bottomBar = (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-end px-6 py-3 gap-3"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid #F1F5F9',
      }}
    >
      <button
        onClick={() => navigate(`/projects/${project.id}/export`)}
        disabled={!hasMemoire}
        className="signature-btn disabled:opacity-40"
        style={{ fontFamily: F }}
      >
        Vérification finale →
      </button>
    </div>
  )

  // ── Generation form (no mémoire yet or regenerate) ─────────────

  if (!hasMemoire || showForm) {
    return (
      <>
        <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" />
        <PipelineProgress
          projectId={project.id}
          active={isGenerating}
          onComplete={() => setGenSuccess(true)}
          onCancel={handleCancel}
          subtitle="Synorix IA redige votre memoire technique..."
        />

        <div className="space-y-4 pb-20" style={{ fontFamily: F }}>
          {/* Title bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>
                Memoire Technique — {lotName}
              </h1>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                {hasMemoire
                  ? `v${memoire.version} — Generee le ${new Date(memoire.generated_at).toLocaleDateString('fr-FR')} par Synorix AI`
                  : 'Generez un memoire technique complet adapte a votre projet'}
              </p>
            </div>
            {hasMemoire && (
              <button
                onClick={() => setShowForm(false)}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-slate-50"
                style={{ color: '#64748B', border: '1px solid #E2E8F0' }}
              >
                Annuler
              </button>
            )}
          </div>

          {/* Critères de jugement */}
          <CriteresCard criteres={criteres} />

          {/* Profile summary */}
          <ProfileSummary stats={profileStats ?? null} />

          {/* Chantier-specific form */}
          <div
            className="bg-white rounded-xl p-5 space-y-5"
            style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#0F172A', fontFamily: F }}>
                Informations specifiques a ce chantier
              </h3>
              <p className="text-[11px] mt-1" style={{ color: '#64748B' }}>
                Ces informations seront integrees dans le memoire pour ce projet
              </p>
            </div>

            {hasMemoire && (
              <p className="text-sm font-medium" style={{ color: '#64748B' }}>
                La regeneration remplacera le memoire actuel.
              </p>
            )}

            {/* Row 1: Ouvriers + Délai */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                  Nombre d&apos;ouvriers dedies <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  value={variables.nb_ouvriers}
                  onChange={(e) => setVariables((v) => ({ ...v, nb_ouvriers: e.target.value }))}
                  className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                  placeholder="Ex: 4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                  Delai estime <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={variables.delai}
                  onChange={(e) => setVariables((v) => ({ ...v, delai: e.target.value }))}
                  className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                  placeholder="Ex: 3 mois"
                />
              </div>
            </div>

            {/* Row 2: Chef de chantier */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>Chef de chantier — nom</label>
                <input
                  type="text"
                  value={variables.chef_chantier_nom}
                  onChange={(e) => setVariables((v) => ({ ...v, chef_chantier_nom: e.target.value }))}
                  className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                  placeholder="Ex: Jean Dupont"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>Qualification</label>
                <input
                  type="text"
                  value={variables.chef_chantier_qualification}
                  onChange={(e) => setVariables((v) => ({ ...v, chef_chantier_qualification: e.target.value }))}
                  className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                  placeholder="Ex: 15 ans d'experience, CACES R482"
                />
              </div>
            </div>

            {/* Row 3: Conducteur de travaux */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>Conducteur de travaux — nom</label>
                <input
                  type="text"
                  value={variables.conducteur_travaux_nom}
                  onChange={(e) => setVariables((v) => ({ ...v, conducteur_travaux_nom: e.target.value }))}
                  className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                  placeholder="Ex: Marie Martin"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>Qualification</label>
                <input
                  type="text"
                  value={variables.conducteur_travaux_qualification}
                  onChange={(e) => setVariables((v) => ({ ...v, conducteur_travaux_qualification: e.target.value }))}
                  className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                  placeholder="Ex: Ingenieur BTP, 10 ans ITE/ravalement"
                />
              </div>
            </div>

            {/* Row 4: Matériel spécifique */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                Materiel specifique au chantier
              </label>
              <textarea
                value={variables.materiel_specifique}
                onChange={(e) => setVariables((v) => ({ ...v, materiel_specifique: e.target.value }))}
                rows={2}
                className="w-full py-2.5 px-3 text-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                placeholder="Ex: echafaudage tubulaire R200, nacelle articulee 20m..."
              />
            </div>

            {/* Row 5: Contraintes */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                Contraintes particulieres
                <span className="font-normal ml-1" style={{ color: '#94A3B8' }}>(optionnel)</span>
              </label>
              <textarea
                value={variables.particularites}
                onChange={(e) => setVariables((v) => ({ ...v, particularites: e.target.value }))}
                rows={2}
                className="w-full py-2.5 px-3 text-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                style={{ border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
                placeholder="Ex: site occupe, horaires restreints 8h-17h..."
              />
            </div>
          </div>

          {/* Error */}
          {genError && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#EF4444' }}
            >
              {genError}
            </p>
          )}

          {/* Generate button */}
          <button
            onClick={() => {
              const plan = organization?.plan ?? 'free'
              if (plan === 'free') { setShowPaywall(true); return }
              setGenError(null)
              generate()
            }}
            disabled={isGenerating || !variables.nb_ouvriers || !variables.delai}
            className="signature-btn disabled:opacity-40"
            style={{ fontFamily: F, padding: '12px 24px' }}
          >
            <Sparkles size={18} />
            {hasMemoire ? 'Regenerer le memoire' : 'Generer le memoire technique'}
          </button>
        </div>

        {createPortal(bottomBar, document.body)}
      </>
    )
  }

  // ── 3-column document view ─────────────────────────────────────

  return (
    <>
      <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" />
      <PipelineProgress
        projectId={project.id}
        active={isGenerating}
        onComplete={() => setGenSuccess(true)}
        onCancel={handleCancel}
        subtitle="Synorix IA redige votre memoire technique..."
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

      <div className="space-y-4 pb-20" style={{ fontFamily: F }}>

        {/* ── Title bar ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>
              Memoire Technique — {lotName}
            </h1>
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                background: displayContent ? 'rgba(14,165,233,0.10)' : '#F1F5F9',
                color: displayContent ? '#0EA5E9' : '#94A3B8',
                border: displayContent ? '1px solid rgba(14,165,233,0.20)' : '1px solid #E2E8F0',
              }}
            >
              {displayContent ? 'Valide' : 'Brouillon'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditor(true)}
              className="flex items-center gap-1.5 text-sm font-medium py-2 px-4 rounded-lg transition-colors hover:bg-slate-50"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}
            >
              <Pencil size={14} /> Modifier
            </button>
            <button
              onClick={() => {
                setIsExporting(true)
                exportToWord(project.id, project.name).finally(() => setIsExporting(false))
              }}
              disabled={isExporting}
              className="flex items-center gap-1.5 text-sm font-medium py-2 px-4 rounded-lg transition-colors hover:bg-slate-50"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}
            >
              <Download size={14} />
              {isExporting ? 'Export...' : 'Export .docx'}
            </button>
          </div>
        </div>

        {/* Subtitle version line */}
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          v{memoire!.version} — Generee le {new Date(memoire!.generated_at).toLocaleDateString('fr-FR')} par Synorix AI
        </p>

        {/* ── 3-column layout ────────────────────────────────────── */}
        {displayContent && (
          <div className="flex gap-6 items-start">

            {/* LEFT — Table of Contents */}
            <div className="shrink-0 hidden xl:block">
              <TocSidebar
                activeSection={activeSection}
                onNavigate={handleTocNavigate}
                completionPct={completionPct}
              />
            </div>

            {/* CENTER — Document */}
            <div className="flex-1 min-w-0">
              <DocumentView content={displayContent} project={project} docRef={docRef} />
            </div>

            {/* RIGHT — Assistant Synorix */}
            <div className="shrink-0 hidden lg:block" style={{ width: 280 }}>
              <div className="sticky top-4 space-y-3">

                {/* Header */}
                <div className="flex items-center gap-2.5">
                  <MessageSquare size={18} style={{ color: '#0EA5E9' }} />
                  <div>
                    <h3 className="text-base font-bold" style={{ color: '#0F172A', fontFamily: F }}>
                      Assistant Synorix
                    </h3>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>
                      Analyse en temps reel...
                    </p>
                  </div>
                </div>

                {/* Suggestion cards */}
                {visibleSuggestions.map((sug) => (
                  <SuggestionCard
                    key={sug.id}
                    suggestion={sug}
                    onDismiss={(id) => setDismissedSuggestions((s) => new Set(s).add(id))}
                  />
                ))}

                {/* Focus IA */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} style={{ color: '#0EA5E9' }} />
                    <span className="text-sm font-bold" style={{ color: '#0EA5E9', fontFamily: F }}>
                      FOCUS IA
                    </span>
                  </div>
                  <p className="text-xs italic leading-relaxed" style={{ color: '#475569' }}>
                    Le memoire technique represente souvent 50-60% de la note finale.
                    Personnalisez chaque section avec vos references reelles et vos moyens
                    specifiques pour maximiser votre score.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {createPortal(bottomBar, document.body)}
    </>
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
