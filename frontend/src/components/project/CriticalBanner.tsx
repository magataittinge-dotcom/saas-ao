import { useQuery } from '@tanstack/react-query'
import { ExternalLink, HelpCircle, Shield } from 'lucide-react'
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

export interface CriticalFieldsPayload {
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
      className="cible-libre cible-etendue rounded p-0.5 align-middle transition-colors"
      style={{ color: 'var(--text-3)' }}
    >
      <ExternalLink size={11} />
    </button>
  )
}

/** Tuile bento : un fait du marché, un label micro, une valeur nette.
 *  `wide` = double largeur pour les contenus bavards (bento asymétrique). */
function Tile({ icon, label, accent, wide, children }: {
  icon: React.ReactNode
  label: string
  accent?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`glass-card top-lit px-4 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="microlabel mb-1.5 flex items-center gap-1.5">
        <span style={{ color: accent ?? 'var(--text-3)' }}>{icon}</span>
        {label}
      </p>
      <div className="text-[15px] font-semibold leading-snug" style={{ color: accent ?? 'var(--text-1)' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * C5 — les faits du marché que la carte « L'AO en 30 secondes » ne dit pas :
 * pénalités de retard et date limite des questions. La remise, la visite, le délai
 * et les critères ne sont dits qu'une fois, dans la carte (R12). Chaque champ garde
 * sa source cliquable ; un champ absent du DCE est absent de la grille.
 */
export function CriticalBannerVue({ data, onOpenSource }: { data: CriticalFieldsPayload; onOpenSource: (s: FieldSource) => void }) {
  const f = data.fields

  const tiles: React.ReactNode[] = []

  if (f.penalites.value) {
    const { retard, plafond } = f.penalites.value
    tiles.push(
      <Tile key="penalites" icon={<Shield size={13} />} label="Pénalités de retard" wide>
        {retard && <span>{retard}</span>}
        {retard && plafond && <span style={{ color: 'var(--text-3)' }}> · </span>}
        {plafond && <span style={{ color: 'var(--text-2)' }}>plafond {plafond}</span>}
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

  if (tiles.length === 0) return null

  return <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
}

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
  return <CriticalBannerVue data={data} onOpenSource={onOpenSource} />
}
