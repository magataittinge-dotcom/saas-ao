import { useNavigate } from 'react-router-dom'
import { Clock, AlertTriangle, ArrowRight, Trash2 } from 'lucide-react'
import { daysUntil } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

const STEP_LABELS = ['Upload DCE', 'Sélection lots', 'Analyse IA', 'Candidature', 'Mémoire', 'Export']
const TOTAL_STEPS = 6
const TERMINAL_STATUSES = new Set(['soumis', 'gagné', 'perdu'])

const STATUS_CONFIG: Record<string, { label: string; cls: string; accent: string }> = {
  brouillon: { label: 'Brouillon', cls: 'pill-muted',   accent: '#9BA4B5' },
  en_cours:  { label: 'En cours',  cls: 'pill-cyan',    accent: '#E4E9F2' },
  soumis:    { label: 'Soumis',    cls: 'pill-muted',   accent: '#C7CEDA' },
  gagné:     { label: 'Gagné',     cls: 'pill-gagne',   accent: '#6EE7A8' },
  perdu:     { label: 'Perdu',     cls: 'pill-danger',  accent: '#F58E86' },
}

interface Props {
  project: Project
  onDelete?: (id: string, name: string) => void
}

export function AOCard({ project, onDelete }: Props) {
  const navigate = useNavigate()
  const isTerminal = TERMINAL_STATUSES.has(project.status)
  const days = project.deadline ? daysUntil(project.deadline) : null
  const isUrgent = !isTerminal && days !== null && days <= 7
  const doneSteps = isTerminal
    ? TOTAL_STEPS
    : Math.min(
        project.completed_steps
          ? Object.values(project.completed_steps).filter(Boolean).length
          : project.current_step - 1,
        TOTAL_STEPS,
      )
  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.brouillon
  const accentColor = isUrgent ? '#F58E86' : status.accent

  return (
    <div
      className="glass-card p-5 cursor-pointer flex flex-col gap-4 relative overflow-hidden"
      style={{
        borderColor: isUrgent ? 'rgba(240,68,56,0.25)' : undefined,
      }}
      onClick={() => navigate(`/projects/${project.id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isUrgent ? 'rgba(240,68,56,0.35)' : 'rgba(228,233,242,0.15)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,.5), 0 0 0 1px ${isUrgent ? 'rgba(240,68,56,0.15)' : 'rgba(228,233,242,0.10)'}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isUrgent ? 'rgba(240,68,56,0.25)' : ''
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = ''
      }}
    >
      {/* Accent top-line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 relative">
        <h3 className="font-semibold text-ds-text text-sm leading-snug line-clamp-2 flex-1">
          {project.name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('pill', status.cls)}>{status.label}</span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(project.id, project.name) }}
              className="p-1 rounded text-ds-text-3 transition-colors hover:text-red-400"
              style={{ lineHeight: 0 }}
              title="Supprimer cet AO"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Maître d'ouvrage */}
      {project.maitre_ouvrage && (
        <p className="text-xs text-ds-text-2 -mt-2 truncate relative">{project.maitre_ouvrage}</p>
      )}

      {/* Metadata: date + lot */}
      <div className="flex items-center gap-3 text-xs -mt-2 relative" style={{ color: '#C7CEDA' }}>
        <span>
          {new Date(project.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {project.selected_lot_name && (
          <span className="truncate" style={{ color: '#C3CCDC' }}>
            {project.selected_lot_name}
          </span>
        )}
      </div>

      {/* Avancement — 6 étapes */}
      <div className="relative">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-ds-text-3">
            {isTerminal ? 'Dossier complet' : STEP_LABELS[project.current_step - 1]}
          </span>
          <span
            className="text-ds-text-2 font-medium"
            style={{ fontFamily: "'Geist Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
          >
            {doneSteps}/{TOTAL_STEPS}
          </span>
        </div>
        <div className="steps-track w-full" style={{ display: 'flex' }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <i
              key={i}
              className={
                i < doneSteps ? 'done' : !isTerminal && i === project.current_step - 1 ? 'active' : ''
              }
              style={{ flex: 1, width: 'auto' }}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between relative">
        {project.deadline && !isTerminal ? (
          <div
            className={cn(
              'flex items-center gap-1.5 text-xs',
              isUrgent ? 'font-medium' : 'text-ds-text-3',
            )}
            style={isUrgent ? { color: '#F58E86' } : undefined}
          >
            {isUrgent ? <AlertTriangle size={11} /> : <Clock size={11} />}
            {days === 0
              ? "Deadline aujourd'hui !"
              : days !== null && days < 0
                ? 'Dépassée'
                : `J-${days}`}
          </div>
        ) : (
          <span />
        )}

        <button
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: '#E4E9F2' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#C3CCDC')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#E4E9F2')}
          onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`) }}
        >
          Continuer
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  )
}
