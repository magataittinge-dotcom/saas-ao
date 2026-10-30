import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, ExternalLink, HelpCircle, MapPin, Shield } from 'lucide-react'
import { api } from '@/services/api'
import { etatEcheance } from '@/lib/echeance'

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
    // 1.14 — la fonction d'échéance commune, à la minute près (heure du RC comprise)
    const echeance = etatEcheance({ date, heure })
    const passed = echeance.etat === 'passee'
    const urgent = echeance.etat === 'aujourdhui' || echeance.etat === 'proche'
    tiles.push(
      <Tile
        key="remise"
        icon={<Calendar size={13} />}
        label="Remise des offres"
        accent={passed ? 'var(--danger-fg)' : urgent ? 'var(--warning-fg)' : undefined}
      >
        <span>{formatFr(date)}</span>
        {heure && <span style={{ color: 'var(--text-2)' }}> · {heure}</span>}
        {echeance.etat !== 'sans_date' && (
          <span
            className="num-mono ml-2 rounded-full px-1.5 py-0.5 align-middle text-xs font-bold whitespace-nowrap"
            style={passed
              ? { background: 'color-mix(in srgb, var(--danger-fg) 10%, transparent)', color: 'var(--danger-fg)' }
              : urgent
                ? { background: 'var(--warn-bg)', color: 'var(--warn)' }
                : { background: 'color-mix(in srgb, var(--text-1) 10%, transparent)', color: 'var(--text-1)' }}
          >
            {echeance.libelle}
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
        accent={oblig && !visite.date ? 'var(--warning-fg)' : undefined}
      >
        {visite.date ? formatFr(visite.date) : (oblig ? 'À planifier' : 'Possible')}
        {' '}<SourceLink source={f.visite_site.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

  if (f.delai_execution.value) {
    tiles.push(
      <Tile
        key="delai"
        icon={<Clock size={13} />}
        label="Délai d'exécution"
        wide={f.delai_execution.value.length > 40}
      >
        {f.delai_execution.value}
        {' '}<SourceLink source={f.delai_execution.source} onOpen={onOpenSource} />
      </Tile>,
    )
  }

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

  // Les critères de notation ne sont plus rendus ici : la jauge du héros
  // de StepAnalysis porte déjà cette information (doublon supprimé — R6).

  if (tiles.length === 0) return null

  return <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
}
