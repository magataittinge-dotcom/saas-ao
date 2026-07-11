import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, ExternalLink, HelpCircle, MapPin, Shield } from 'lucide-react'
import { api } from '@/services/api'

// ── Types (miroir de services/critical_fields.py) ────────────────────────────

export interface FieldSource {
  document: string
  page: number | null
  excerpt: string | null
}

interface Field<T> {
  value: T | null
  source: FieldSource | null
}

interface CriticalFieldsPayload {
  lot: string | null
  fields: {
    date_limite_remise: Field<{ date: string; heure: string | null }>
    date_limite_questions: Field<string>
    visite_site: Field<{ statut: 'obligatoire' | 'facultative' | 'non_mentionnee'; date: string | null }>
    criteres: Field<{ nom: string; poids: number; sous_criteres?: { nom: string; poids: number }[] }[]>
    penalites: Field<{ retard: string | null; plafond: string | null }>
    delai_execution: Field<string>
  }
}

interface Props {
  projectId: string
  onOpenSource: (source: FieldSource) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function formatFr(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function SourceLink({ source, onOpen }: { source: FieldSource | null; onOpen: (s: FieldSource) => void }) {
  if (!source) return null
  return (
    <button
      onClick={() => onOpen(source)}
      title={`Voir la source — ${source.document}`}
      className="p-0.5 rounded transition-colors align-middle"
      style={{ color: '#6B7280' }}
    >
      <ExternalLink size={11} />
    </button>
  )
}

function Tile({ icon, label, children, accent }: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5" style={{ color: accent ?? '#9AA3AE' }}>{icon}</span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9AA3AE' }}>{label}</p>
        <div className="text-sm" style={{ color: accent ?? '#C9CFD6' }}>{children}</div>
      </div>
    </div>
  )
}

/**
 * C5 — bandeau critique de l'analyse : deadline avec compte à rebours,
 * badges visite/délai, critères en barres de pondération, pénalités,
 * date limite des questions. Chaque champ garde sa source (cliquable).
 * Un champ absent du DCE est simplement absent du bandeau.
 */
export default function CriticalBanner({ projectId, onOpenSource }: Props) {
  const { data } = useQuery<CriticalFieldsPayload>({
    queryKey: ['critical-fields', projectId],
    queryFn: async () => {
      const { data } = await api.get<CriticalFieldsPayload>(`/projects/${projectId}/critical-fields`)
      return data
    },
    staleTime: 60_000,
  })

  if (!data) return null
  const f = data.fields

  const tiles: React.ReactNode[] = []

  if (f.date_limite_remise.value) {
    const { date, heure } = f.date_limite_remise.value
    const days = daysUntil(date)
    const urgent = days !== null && days < 7
    const passed = days !== null && days < 0
    tiles.push(
      <Tile key="remise" icon={<Calendar size={14} />} label="Remise des offres"
        accent={urgent ? '#F87171' : undefined}>
        <span className="font-semibold">{formatFr(date)}</span>
        {heure && <span> à {heure}</span>}
        {days !== null && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold"
            style={passed
              ? { background: 'rgba(248,113,113,0.10)', color: '#F87171' }
              : urgent
                ? { background: 'rgba(248,113,113,0.10)', color: '#F87171' }
                : { background: 'rgba(34,211,238,0.10)', color: '#67E8F9' }}>
            {passed ? 'échue' : `J−${days}`}
          </span>
        )}
        {' '}<SourceLink source={f.date_limite_remise.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.date_limite_questions.value) {
    tiles.push(
      <Tile key="questions" icon={<HelpCircle size={14} />} label="Questions jusqu'au">
        {formatFr(f.date_limite_questions.value)}
        {' '}<SourceLink source={f.date_limite_questions.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  const visite = f.visite_site.value
  if (visite && visite.statut !== 'non_mentionnee') {
    const oblig = visite.statut === 'obligatoire'
    tiles.push(
      <Tile key="visite" icon={<MapPin size={14} />} label={`Visite ${oblig ? 'obligatoire' : 'facultative'}`}
        accent={oblig ? '#F87171' : undefined}>
        {visite.date ? formatFr(visite.date) : (oblig ? 'À planifier' : 'Possible')}
        {' '}<SourceLink source={f.visite_site.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.delai_execution.value) {
    tiles.push(
      <Tile key="delai" icon={<Clock size={14} />} label="Délai d'exécution">
        {f.delai_execution.value}
        {' '}<SourceLink source={f.delai_execution.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.penalites.value) {
    const { retard, plafond } = f.penalites.value
    tiles.push(
      <Tile key="penalites" icon={<Shield size={14} />} label="Pénalités">
        {retard && <span>{retard}</span>}
        {retard && plafond && <span> · </span>}
        {plafond && <span>plafond {plafond}</span>}
        {' '}<SourceLink source={f.penalites.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  const criteres = f.criteres.value
  const totalPoids = criteres?.reduce((s, c) => s + (c.poids || 0), 0) || 0

  if (tiles.length === 0 && !criteres) return null

  return (
    <div className="rounded-lg px-5 py-3 space-y-3" style={{ background: '#232730', border: '1px solid rgba(255,255,255,0.06)' }}>
      {tiles.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          {tiles.map((tile, i) => (
            <div key={i} className="flex items-start gap-x-6">
              {tile}
              {i < tiles.length - 1 && (
                <div className="w-px self-stretch ml-6" style={{ background: '#4B5563', minHeight: 24 }} />
              )}
            </div>
          ))}
        </div>
      )}

      {criteres && totalPoids > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9AA3AE' }}>
              Critères de notation
            </p>
            <SourceLink source={f.criteres.source} onOpen={onOpenSource} />
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: '#232730' }}>
            {criteres.map((c, i) => (
              <div
                key={i}
                title={`${c.nom} — ${c.poids} %`}
                style={{
                  width: `${(c.poids / totalPoids) * 100}%`,
                  background: /prix/i.test(c.nom) ? '#E7EAEE' : i % 2 === 0 ? '#22D3EE' : '#67E8F9',
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {criteres.map((c, i) => (
              <span key={i} className="text-[11px]" style={{ color: '#9AA3AE' }}>
                <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={{ background: /prix/i.test(c.nom) ? '#E7EAEE' : i % 2 === 0 ? '#22D3EE' : '#67E8F9' }} />
                {c.nom} <span className="font-semibold">{c.poids} %</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
