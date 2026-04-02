import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, ExternalLink, Search, Building2, Calendar, MapPin, Euro, Clock,
  AlertTriangle, CreditCard, Shield, Eye, GitBranch, Truck, CheckCircle2, Filter,
} from 'lucide-react'
import { api } from '@/services/api'
import LoadingProgress from '@/components/common/LoadingProgress'
import type { Project, ComplianceItem, ComplianceCategory, CritereJugement, InfosMarche, ProjectDocument } from '@/types'
import { useCompleteStep } from '@/hooks/useProject'

const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  candidature:       'Candidature',
  offre:             'Offre',
  technique:         'Technique',
  planning:          'Planning',
  criteres_notation: 'Critères de notation',
}

const CATEGORY_ORDER: ComplianceCategory[] = [
  'candidature', 'offre', 'technique', 'planning', 'criteres_notation',
]

interface Props { project: Project }
type FilterCategory = 'all' | ComplianceCategory

export default function StepAnalysis({ project }: Props) {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all')
  const [search, setSearch] = useState('')
  const { mutate: completeStep, isPending: isValidating } = useCompleteStep(project.id)

  // Charger les documents du projet pour l'ouverture de la source
  const { data: projectDocs = [] } = useQuery({
    queryKey: ['project-documents', project.id],
    queryFn: async () => {
      const { data } = await api.get<ProjectDocument[]>(`/projects/${project.id}/documents`)
      return data
    },
  })

  // Ouvrir le document source dans un nouvel onglet
  const openSourceDocument = (item: ComplianceItem) => {
    if (!item.source_document && !item.source_page) return

    const sourceDoc = (item.source_document || '').toLowerCase().trim()
    const sourceBase = sourceDoc.replace(/\s*p\.?\s*\d+/gi, '').trim()

    const matchedDoc = projectDocs.find(doc => {
      const docType = doc.type.toLowerCase()
      const docName = doc.file_name.toLowerCase()

      if (sourceBase === docType) return true
      if ((sourceBase === 'rc' || sourceBase === 'règlement de consultation' || sourceBase === 'reglement de consultation')
          && (docType === 'rc' || docName.includes('règlement') || docName.includes('reglement') || docName.includes('_rc') || docName.includes(' rc'))) return true
      if ((sourceBase === 'cctp') && (docType === 'cctp' || docName.includes('cctp'))) return true
      if ((sourceBase === 'ccap') && (docName.includes('ccap'))) return true
      if ((sourceBase === 'dpgf') && (docType === 'dpgf' || docName.includes('dpgf'))) return true
      if ((sourceBase === 'ae' || sourceBase === "acte d'engagement" || sourceBase === 'acte_engagement' || sourceBase === 'attri1' || sourceBase === 'attri')
          && (docType === 'acte_engagement' || docName.includes('engagement') || docName.includes('attri'))) return true
      if (sourceBase === 'dc1' && docName.includes('dc1')) return true
      if (sourceBase === 'dc2' && docName.includes('dc2')) return true
      if (sourceBase === 'bpu' && docName.includes('bpu')) return true
      if (sourceBase === 'cadre de réponse' && docName.includes('cadre')) return true
      if (sourceBase.length > 2 && docName.includes(sourceBase)) return true

      return false
    })

    const doc = matchedDoc || projectDocs[0]
    if (!doc) return

    // In dev, use relative URL (goes through Vite proxy → backend)
    // In prod, use VITE_API_URL or empty string
    const baseUrl = import.meta.env.PROD
      ? (import.meta.env.VITE_API_URL || '')
      : ''

    // Utiliser le PDF converti s'il existe, sinon le fichier original
    const fileUrlToUse = doc.pdf_preview_url || doc.file_url

    let relativePath = fileUrlToUse
    if (relativePath.startsWith('/uploads/')) {
      relativePath = relativePath.replace('/uploads/', '')
    } else if (relativePath.startsWith('http')) {
      window.open(relativePath, '_blank')
      return
    }

    // Encoder chaque segment du path séparément pour préserver les /
    const viewUrl = `${baseUrl}/api/files/view/${relativePath.split('/').map(s => encodeURIComponent(s)).join('/')}`
    const params = new URLSearchParams()

    if (item.source_page) {
      params.set('page', String(item.source_page))
    }
    if (item.source_excerpt) {
      params.set('highlight', item.source_excerpt)
    }

    const queryString = params.toString()
    const isPdf = fileUrlToUse.toLowerCase().endsWith('.pdf')

    // URL finale : /api/files/view/path?page=X&highlight=texte#page=X
    let finalUrl = queryString ? `${viewUrl}?${queryString}` : viewUrl

    // Ajouter #page=X pour que le navigateur scroll à la bonne page
    if (isPdf && item.source_page) {
      finalUrl += `#page=${item.source_page}`
    }

    window.open(finalUrl, '_blank')
  }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['compliance', project.id],
    queryFn: async () => {
      const { data } = await api.get<ComplianceItem[]>(`/projects/${project.id}/compliance`)
      return data
    },
    refetchInterval: (query) => (query.state.data?.length === 0 ? 3000 : false),
    refetchIntervalInBackground: false,
  })

  const counts = useMemo(() => {
    const map: Partial<Record<ComplianceCategory, number>> = {}
    for (const item of items) {
      map[item.category] = (map[item.category] ?? 0) + 1
    }
    return map
  }, [items])

  const filtered = useMemo(() => {
    let result = items
    if (activeFilter !== 'all') result = result.filter((i) => i.category === activeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.exigence_text.toLowerCase().includes(q) ||
          (i.source_document ?? '').toLowerCase().includes(q) ||
          (i.source_excerpt ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, activeFilter, search])

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.reduce<Record<string, ComplianceItem[]>>((acc, cat) => {
        const catItems = filtered.filter((i) => i.category === cat)
        if (catItems.length > 0) acc[cat] = catItems
        return acc
      }, {}),
    [filtered],
  )

  const isStepAlreadyDone = project.completed_steps?.['3'] === true

  const handleValidate = () => {
    completeStep(3, {
      onSuccess: () => navigate(`/projects/${project.id}/candidature`),
    })
  }

  // Poll analysis progress when items are empty
  const { data: analysisProgress } = useQuery({
    queryKey: ['analysis-progress', project.id],
    queryFn: async () => {
      try {
        const { data } = await api.get<{
          total_docs: number
          analyzed_docs: number
          current_doc_name: string
          status: string
        }>(`/projects/${project.id}/analysis-progress`)
        return data
      } catch {
        return null
      }
    },
    enabled: !isLoading && items.length === 0,
    refetchInterval: 2000,
  })

  const analysisPercent = analysisProgress
    ? analysisProgress.total_docs > 0
      ? (analysisProgress.analyzed_docs / analysisProgress.total_docs) * 100
      : 10
    : 15 // Fallback when endpoint isn't available

  // ── Lot filter computation (must be before any early return) ────────────
  const lotFilterInfo = useMemo(() => {
    if (!project.selected_lot || project.selected_lot === 'all') return null
    const lotNum = project.selected_lot.replace(/^lot/i, '').replace(/^0+/, '') || '0'
    const isIncluded = (doc: typeof projectDocs[0]) => {
      const tags = doc.related_lots
      if (!tags) return true
      if (tags.includes('all')) return true
      if (tags.every(t => t === 'info')) return false
      return tags.some(t => t !== 'info' && (t.replace(/^0+/, '') || '0') === lotNum)
    }
    return {
      included: projectDocs.filter(isIncluded),
      excluded: projectDocs.filter(d => !isIncluded(d)),
      lotLabel: project.selected_lot_name || `Lot ${lotNum}`,
    }
  }, [projectDocs, project.selected_lot, project.selected_lot_name])

  if (isLoading) return (
    <div className="glass-card p-12 flex flex-col items-center gap-3">
      <Loader2 size={32} className="animate-spin" style={{ color: '#3B82F6' }} />
      <p className="text-ds-text font-medium">Chargement de l&apos;analyse...</p>
    </div>
  )

  if (items.length === 0) return (
    <div className="glass-card p-12">
      <LoadingProgress
        progress={analysisPercent}
        label="Analyse IA en cours..."
        sublabel={
          analysisProgress
            ? `Document ${analysisProgress.analyzed_docs}/${analysisProgress.total_docs} — ${analysisProgress.current_doc_name}`
            : "L'IA lit vos documents et extrait toutes les informations"
        }
        variant="analysis"
      />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* ── Bandeau filtre lot ───────────────────────────────────── */}
      {lotFilterInfo && (
        <LotFilterBanner
          lotLabel={lotFilterInfo.lotLabel}
          included={lotFilterInfo.included}
          excluded={lotFilterInfo.excluded}
        />
      )}

      {/* ── Infos marché ─────────────────────────────────────────── */}
      {project.infos_marche && <InfosMarcheCard infos={project.infos_marche} />}

      {/* ── Conditions financières ────────────────────────────────── */}
      {project.infos_marche && hasFinancialInfo(project.infos_marche) && (
        <ConditionsFinancieresCard infos={project.infos_marche} />
      )}

      {/* ── Conditions d'exécution ─────────────────────────────────── */}
      {project.infos_marche && hasExecutionInfo(project.infos_marche) && (
        <ConditionsExecutionCard infos={project.infos_marche} />
      )}

      {/* ── Critères de jugement ──────────────────────────────────── */}
      {project.criteres_jugement && project.criteres_jugement.length > 0 && (
        <CriteresJugementCard criteres={project.criteres_jugement} />
      )}

      {/* ── Rapport d'exigences extrait ───────────────────────────── */}
      <div className="glass-card p-6 space-y-5">

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ds-text">Rapport d&apos;analyse DCE</h2>
            <p className="text-sm text-ds-text-2 mt-1">
              {items.length} informations extraites du dossier
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-2xl font-bold"
              style={{ fontFamily: '"JetBrains Mono", monospace', color: '#3B82F6' }}
            >
              {items.length}
            </div>
            <div className="text-xs text-ds-text-3">exigences</div>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          <FilterPill label={`Tout (${items.length})`} active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
          {CATEGORY_ORDER.filter((cat) => counts[cat]).map((cat) => (
            <FilterPill
              key={cat}
              label={`${CATEGORY_LABELS[cat]} (${counts[cat]})`}
              active={activeFilter === cat}
              onClick={() => setActiveFilter(cat)}
            />
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une exigence extraite..."
            className="glass-input w-full py-2.5 text-sm pl-9"
          />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-ds-text-3 py-8">Aucune exigence trouvée</p>
        )}

        {/* Table — information, not checklist (no statut column) */}
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-ds-text-3 uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat as ComplianceCategory]} ({catItems.length})
              </h3>
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(59,130,246,0.10)' }}>
                <table className="table-dark">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Exigence extraite du DCE</th>
                      <th className="w-28">Source</th>
                      <th className="w-24">Priorité</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item, index) => (
                      <tr key={item.id}>
                        <td className="text-ds-text-3 text-xs">{index + 1}</td>
                        <td className="pr-4">
                          <p className="text-ds-text">{item.exigence_text}</p>
                          {item.source_excerpt && (
                            <p className="text-xs text-ds-text-3 mt-0.5 italic truncate max-w-md">
                              «{item.source_excerpt}»
                            </p>
                          )}
                          {item.suggestion_ia && (
                            <p className="text-xs mt-1 italic" style={{ color: '#60A5FA' }}>
                              💡 {item.suggestion_ia}
                            </p>
                          )}
                        </td>
                        <td className="text-xs text-ds-text-2">
                          {item.source_document}
                          {item.source_page && ` p.${item.source_page}`}
                        </td>
                        <td>
                          <span
                            className="text-xs rounded-full px-2 py-0.5 border"
                            style={
                              item.priority === 'obligatoire'
                                ? { background: 'rgba(239,68,68,0.12)', color: '#F87171', borderColor: 'rgba(239,68,68,0.25)' }
                                : item.priority === 'souhaitée' || item.priority === 'souhaite' || item.priority === 'recommandé'
                                ? { background: 'rgba(245,158,11,0.12)', color: '#FCD34D', borderColor: 'rgba(245,158,11,0.25)' }
                                : { background: 'rgba(255,255,255,0.06)', color: '#64748B', borderColor: 'rgba(255,255,255,0.08)' }
                            }
                          >
                            {item.priority}
                          </span>
                        </td>
                        <td>
                          {(item.source_page || item.source_document) && (
                            <button
                              onClick={() => openSourceDocument(item)}
                              className="p-1 text-ds-text-3 hover:text-ds-cyan transition-colors"
                              title={`Voir dans ${item.source_document || 'le document'}${item.source_page ? ` p.${item.source_page}` : ''}`}
                            >
                              <ExternalLink size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* ── Bouton validation ─────────────────────────────────────── */}
        <div
          className="flex items-center justify-between pt-4 mt-2"
          style={{ borderTop: '1px solid rgba(59,130,246,0.10)' }}
        >
          <p className="text-sm text-ds-text-2">
            {isStepAlreadyDone
              ? 'Analyse déjà validée — vous pouvez passer à la candidature'
              : 'Prenez connaissance des exigences avant de passer à la candidature'}
          </p>
          <button
            onClick={handleValidate}
            disabled={isValidating}
            className="btn-primary flex items-center gap-2 px-6 py-2.5"
            style={
              isStepAlreadyDone
                ? { background: 'linear-gradient(135deg, #10B981, #3B82F6)' }
                : undefined
            }
          >
            {isStepAlreadyDone
              ? <><CheckCircle2 size={16} /> Passer à la candidature</>
              : isValidating
              ? <><Loader2 size={16} className="animate-spin" /> Validation...</>
              : <><CheckCircle2 size={16} /> J&apos;ai pris connaissance de l&apos;analyse ✓</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasFinancialInfo(infos: InfosMarche): boolean {
  return !!(
    infos.conditions_paiement ||
    infos.penalites_retard ||
    infos.retenue_garantie_pct != null ||
    infos.validite_offres_jours != null
  )
}

function hasExecutionInfo(infos: InfosMarche): boolean {
  return !!(
    infos.visite_site ||
    infos.variantes_autorisees != null ||
    infos.conditions_sous_traitance ||
    (infos.assurances_specifiques && infos.assurances_specifiques.length > 0)
  )
}

// ─── Filter Pill ──────────────────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150"
      style={
        active
          ? { background: 'rgba(59,130,246,0.20)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.35)' }
          : { background: 'rgba(255,255,255,0.05)', color: '#64748B', border: '1px solid rgba(255,255,255,0.08)' }
      }
    >
      {label}
    </button>
  )
}

// ─── Infos Marché Card ────────────────────────────────────────────────────────

function InfosMarcheCard({ infos }: { infos: InfosMarche }) {
  const fields = [
    { icon: Building2,     label: "Maître d'ouvrage",       value: infos.maitre_ouvrage },
    { icon: Building2,     label: "Maître d'œuvre",         value: infos.maitre_oeuvre },
    { icon: MapPin,        label: 'Lots',                   value: infos.lots?.join(', ') },
    { icon: Clock,         label: 'Durée du marché',        value: infos.duree_marche },
    { icon: Euro,          label: 'Montant estimé',         value: infos.montant_estime },
    { icon: Calendar,      label: 'Date limite de réponse', value: infos.date_limite_reponse },
    { icon: AlertTriangle, label: 'Procédure',              value: infos.type_procedure },
  ].filter((f) => f.value)

  if (fields.length === 0) return null

  return (
    <div className="glass-card p-5">
      <h2 className="text-xs font-semibold text-ds-text-3 uppercase tracking-widest mb-3">
        Informations du marché
      </h2>
      {infos.objet && (
        <p className="text-base font-semibold text-ds-text mb-3">{infos.objet}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon size={14} className="mt-0.5 shrink-0" style={{ color: '#3B82F6' }} />
            <div>
              <p className="text-xs text-ds-text-3">{label}</p>
              <p className="text-sm text-ds-text font-medium">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Conditions Financières Card ──────────────────────────────────────────────

function ConditionsFinancieresCard({ infos }: { infos: InfosMarche }) {
  const rows: { label: string; value: string }[] = []

  if (infos.conditions_paiement) {
    const cp = infos.conditions_paiement
    if (cp.delai_jours != null) rows.push({ label: 'Délai de paiement', value: `${cp.delai_jours} jours` })
    if (cp.avance_pct != null) rows.push({ label: 'Avance forfaitaire', value: `${cp.avance_pct}%` })
    if (cp.acomptes) rows.push({ label: 'Acomptes', value: cp.acomptes })
  }
  if (infos.penalites_retard) rows.push({ label: 'Pénalités de retard', value: infos.penalites_retard })
  if (infos.retenue_garantie_pct != null) {
    let v = `${infos.retenue_garantie_pct}%`
    if (infos.caution_remplacante) v += ' (remplacement par caution autorisé)'
    rows.push({ label: 'Retenue de garantie', value: v })
  }
  if (infos.validite_offres_jours != null) {
    rows.push({ label: 'Validité des offres', value: `${infos.validite_offres_jours} jours` })
  }

  if (rows.length === 0) return null

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard size={16} style={{ color: '#60A5FA' }} />
        <h2 className="text-xs font-semibold text-ds-text-3 uppercase tracking-widest">
          Conditions financières
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="rounded-lg p-3" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}>
            <p className="text-xs text-ds-text-3 mb-0.5">{label}</p>
            <p className="text-sm text-ds-text font-medium">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Conditions d'Exécution Card ──────────────────────────────────────────────

function ConditionsExecutionCard({ infos }: { infos: InfosMarche }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} style={{ color: '#F59E0B' }} />
        <h2 className="text-xs font-semibold text-ds-text-3 uppercase tracking-widest">
          Conditions d&apos;exécution
        </h2>
      </div>
      <div className="space-y-3">

        {infos.visite_site && (
          <InfoRow
            icon={<Eye size={14} style={{ color: '#3B82F6' }} />}
            label="Visite de site"
            value={infos.visite_site.obligatoire ? 'Obligatoire' : 'Facultative'}
            detail={infos.visite_site.details ?? undefined}
            accent={infos.visite_site.obligatoire ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.08)'}
            accentBorder={infos.visite_site.obligatoire ? 'rgba(239,68,68,0.20)' : 'rgba(59,130,246,0.15)'}
          />
        )}

        {infos.variantes_autorisees != null && (
          <InfoRow
            icon={<GitBranch size={14} style={{ color: '#8B5CF6' }} />}
            label="Variantes"
            value={infos.variantes_autorisees ? 'Autorisées' : 'Non autorisées'}
            accent={infos.variantes_autorisees ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)'}
            accentBorder={infos.variantes_autorisees ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.08)'}
          />
        )}

        {infos.conditions_sous_traitance && (
          <InfoRow
            icon={<Truck size={14} style={{ color: '#F59E0B' }} />}
            label="Sous-traitance"
            value={infos.conditions_sous_traitance}
          />
        )}

        {infos.assurances_specifiques && infos.assurances_specifiques.length > 0 && (
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={13} style={{ color: '#F59E0B' }} />
              <p className="text-xs text-ds-text-3">Assurances spécifiques requises</p>
            </div>
            <ul className="space-y-1">
              {infos.assurances_specifiques.map((a, i) => (
                <li key={i} className="text-sm text-ds-text flex items-start gap-2">
                  <span style={{ color: '#F59E0B', marginTop: 2 }}>•</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  icon, label, value, detail, accent, accentBorder,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail?: string
  accent?: string
  accentBorder?: string
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: accent ?? 'rgba(255,255,255,0.03)',
        border: `1px solid ${accentBorder ?? 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        {icon}
        <p className="text-xs text-ds-text-3">{label}</p>
      </div>
      <p className="text-sm text-ds-text font-medium">{value}</p>
      {detail && <p className="text-xs text-ds-text-2 mt-0.5">{detail}</p>}
    </div>
  )
}

// ─── Critères de Jugement Card ─────────────────────────────────────────────────

const CRITERE_COLORS = [
  { bar: '#3B82F6', text: '#60A5FA', bg: 'rgba(59,130,246,0.10)'  },
  { bar: '#10B981', text: '#34D399', bg: 'rgba(16,185,129,0.10)'  },
  { bar: '#8B5CF6', text: '#A78BFA', bg: 'rgba(139,92,246,0.10)'  },
  { bar: '#F59E0B', text: '#FCD34D', bg: 'rgba(245,158,11,0.10)'  },
]

function getCritereColor(nom: string, index: number) {
  const lower = nom.toLowerCase()
  if (lower.includes('prix'))                                      return CRITERE_COLORS[0]
  if (lower.includes('valeur') || lower.includes('technique'))     return CRITERE_COLORS[1]
  return CRITERE_COLORS[index % CRITERE_COLORS.length]
}

// ─── Lot Filter Banner (PARTIE 5) ─────────────────────────────────────────────

function LotFilterBanner({
  lotLabel,
  included,
  excluded,
}: {
  lotLabel: string
  included: ProjectDocument[]
  excluded: ProjectDocument[]
}) {
  const [expanded, setExpanded] = useState(false)
  const total = included.length + excluded.length

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.20)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter size={15} style={{ color: '#60A5FA' }} />
          <p className="text-sm font-medium" style={{ color: '#60A5FA' }}>
            Analyse ciblée sur le {lotLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ds-text-2">
            <span className="font-semibold" style={{ color: '#60A5FA' }}>{included.length}</span>
            <span className="text-ds-text-3"> / {total} documents analysés</span>
          </span>
          {total > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-ds-text-3 hover:text-ds-text transition-colors"
            >
              {expanded ? 'Masquer' : 'Détails'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-1.5 pt-1">
          {included.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: '#10B981' }}
              />
              <span className="text-xs text-ds-text truncate">{doc.file_name}</span>
              <span className="text-xs text-ds-text-3 ml-auto shrink-0">
                {doc.related_lots?.includes('all') ? 'tous lots' : `lot ${(doc.related_lots ?? []).filter(t => t !== 'info').join(', ')}`}
              </span>
            </div>
          ))}
          {excluded.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 opacity-50">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: '#475569' }}
              />
              <span className="text-xs text-ds-text-2 truncate">{doc.file_name}</span>
              <span className="text-xs text-ds-text-3 ml-auto shrink-0">Non inclus</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function CriteresJugementCard({ criteres }: { criteres: CritereJugement[] }) {
  const topTech = criteres
    .filter((c) => !c.nom.toLowerCase().includes('prix'))
    .sort((a, b) => b.poids - a.poids)[0]

  return (
    <div className="glass-card p-5">
      <h2 className="text-xs font-semibold text-ds-text-3 uppercase tracking-widest mb-3">
        Critères de jugement des offres
      </h2>

      {topTech && topTech.poids >= 40 && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg px-3 py-2"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
          <p className="text-sm" style={{ color: '#FCD34D' }}>
            <span className="font-semibold">{topTech.nom}</span> compte pour{' '}
            <span className="font-semibold">{topTech.poids}%</span> — soignez particulièrement votre mémoire technique !
          </p>
        </div>
      )}

      <div className="space-y-3">
        {criteres.map((critere, i) => {
          const color = getCritereColor(critere.nom, i)
          return (
            <div key={critere.nom}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ds-text">{critere.nom}</span>
                <span className="text-sm font-bold" style={{ color: color.text, fontFamily: '"JetBrains Mono", monospace' }}>
                  {critere.poids}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${critere.poids}%`, background: color.bar, boxShadow: `0 0 8px ${color.bar}55` }}
                />
              </div>
              {critere.sous_criteres && critere.sous_criteres.length > 0 && (
                <div className="mt-2 ml-4 space-y-1.5">
                  {critere.sous_criteres.map((sc) => (
                    <div key={sc.nom}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-ds-text-2">{sc.nom}</span>
                        <span className="text-xs font-medium text-ds-text-2" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          {sc.poids}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${sc.poids}%`, background: color.bar, opacity: 0.6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
