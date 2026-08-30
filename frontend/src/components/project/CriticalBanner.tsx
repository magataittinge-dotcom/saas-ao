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
      className="rounded p-0.5 align-middle transition-colors"
      style={{ color: '#55565A' }}
    >
      <ExternalLink size={11} />
    </button>
  )
}

/** Tuile bento : un fait du marché, un label micro, une valeur nette. */
function Tile({ icon, label, accent, children }: {
  icon: React.ReactNode
  label: string
  accent?: string
  children: React.ReactNode
}) {
  return (
    <div className="glass-card top-lit px-4 py-3.5">
      <p className="microlabel mb-1.5 flex items-center gap-1.5">
        <span style={{ color: accent ?? '#6B6C6F' }}>{icon}</span>
        {label}
      </p>
      <div className="text-[15px] font-semibold leading-snug" style={{ color: accent ?? '#F7F8F8' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * C5 — les faits critiques du marché, en grille bento : remise des offres
 * (compte à rebours), visite, délai, pénalités, questions — puis les
 * critères de notation en barre pleine largeur. Chaque champ garde sa
 * source cliquable ; un champ absent du DCE est absent de la grille.
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
    const passed = days !== null && days < 0
    const urgent = days !== null && days >= 0 && days < 7
    tiles.push(
      <Tile
        key="remise"
        icon={<Calendar size={13} />}
        label="Remise des offres"
        accent={passed ? '#F58E86' : urgent ? '#D9A441' : undefined}
      >
        <span>{formatFr(date)}</span>
        {heure && <span style={{ color: '#B4B5B8' }}> · {heure}</span>}
        {days !== null && (
          <span
            className="num-mono ml-2 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase"
            style={passed
              ? { background: 'rgba(245,142,134,0.10)', color: '#F58E86' }
              : urgent
                ? { background: 'var(--warn-bg)', color: 'var(--warn)' }
                : { background: 'rgba(255,255,255,0.10)', color: '#F7F8F8' }}
          >
            {passed ? 'échue' : `J−${days}`}
          </span>
        )}
        {' '}<SourceLink source={f.date_limite_remise.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  const visite = f.visite_site.value
  if (visite && visite.statut !== 'non_mentionnee') {
    const oblig = visite.statut === 'obligatoire'
    tiles.push(
      <Tile
        key="visite"
        icon={<MapPin size={13} />}
        label={`Visite ${oblig ? 'obligatoire' : 'facultative'}`}
        accent={oblig && !visite.date ? '#D9A441' : undefined}
      >
        {visite.date ? formatFr(visite.date) : (oblig ? 'À planifier' : 'Possible')}
        {' '}<SourceLink source={f.visite_site.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.delai_execution.value) {
    tiles.push(
      <Tile key="delai" icon={<Clock size={13} />} label="Délai d'exécution">
        {f.delai_execution.value}
        {' '}<SourceLink source={f.delai_execution.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.penalites.value) {
    const { retard, plafond } = f.penalites.value
    tiles.push(
      <Tile key="penalites" icon={<Shield size={13} />} label="Pénalités de retard">
        {retard && <span>{retard}</span>}
        {retard && plafond && <span style={{ color: '#6B6C6F' }}> · </span>}
        {plafond && <span style={{ color: '#B4B5B8' }}>plafond {plafond}</span>}
        {' '}<SourceLink source={f.penalites.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.date_limite_questions.value) {
    tiles.push(
      <Tile key="questions" icon={<HelpCircle size={13} />} label="Questions jusqu'au">
        {formatFr(f.date_limite_questions.value)}
        {' '}<SourceLink source={f.date_limite_questions.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  const criteres = f.criteres.value
  const totalPoids = criteres?.reduce((s, c) => s + (c.poids || 0), 0) || 0

  if (tiles.length === 0 && !criteres) return null

  return (
    <div className="space-y-3">
      {tiles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
      )}

      {criteres && totalPoids > 0 && (
        <div className="glass-card px-4 py-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <p className="microlabel">Critères de notation</p>
            <SourceLink source={f.criteres.source} onOpen={onOpenSource} />
          </div>
          <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
            {criteres.map((c, i) => (
              <div
                key={i}
                title={`${c.nom} — ${c.poids} %`}
                style={{
                  width: `${(c.poids / totalPoids) * 100}%`,
                  background: /prix/i.test(c.nom) ? '#FFFFFF' : i % 2 === 0 ? '#E8E9EB' : '#98999C',
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {criteres.map((c, i) => (
              <span key={i} className="text-[11px]" style={{ color: '#959597' }}>
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: /prix/i.test(c.nom) ? '#FFFFFF' : i % 2 === 0 ? '#E8E9EB' : '#98999C' }}
                />
                {c.nom} <span className="num-mono font-semibold" style={{ color: '#D8D9DB' }}>{c.poids} %</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
