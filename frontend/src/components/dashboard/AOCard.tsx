import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, ArrowRight, Send, Trash2, Trophy, X } from 'lucide-react'
import { api } from '@/services/api'
import { daysUntil } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

import { PIPELINE_STEPS } from './PipelineRail'

const STATUS_CONFIG: Record<string, { label: string; cls: string; accent: string }> = {
  brouillon:  { label: 'Brouillon',            cls: 'pill-muted',   accent: '#9BA4B5' },
  en_cours:   { label: 'En cours',             cls: 'pill-cyan',    accent: '#E4E9F2' },
  analyzed:   { label: 'Analysé',              cls: 'pill-cyan',    accent: '#E4E9F2' },
  sans_suite: { label: 'Analysé — sans suite', cls: 'pill-muted',   accent: '#788295' },
  soumis:     { label: 'Déposé',               cls: 'pill-muted',   accent: '#C7CEDA' },
  gagné:      { label: 'Gagné',                cls: 'pill-gagne',   accent: '#6EE7A8' },
  perdu:      { label: 'Perdu',                cls: 'pill-danger',  accent: '#F58E86' },
}

interface Props {
  project: Project
  onDelete?: (id: string, name: string) => void
}

export function AOCard({ project, onDelete }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // C14 — cycle de vie post-export en 1 clic : Prêt → Déposé → Gagné/Perdu
  const { mutate: setStatus, isPending: statusPending } = useMutation({
    mutationFn: async (status: string) => {
      await api.patch(`/projects/${project.id}`, { status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
  const isReady = project.current_step >= 6
    && ['brouillon', 'en_cours', 'analyzed'].includes(project.status)
  const isDeposed = project.status === 'soumis'

  const days = project.deadline ? daysUntil(project.deadline) : null
  const isUrgent = days !== null && days <= 7
  // 6 étapes réelles (cf. PIPELINE_STEPS) — clamp : jamais > 100 %, jamais
  // de libellé « undefined » à l'étape Export.
  const stepIndex = Math.min(Math.max(project.current_step, 1), PIPELINE_STEPS.length)
  const progress = ((stepIndex - 1) / (PIPELINE_STEPS.length - 1)) * 100
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

      {/* Progress */}
      <div className="relative">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-ds-text-3">{PIPELINE_STEPS[stepIndex - 1]}</span>
          <span
            className="text-ds-text-2 font-medium"
            style={{ fontFamily: '"Geist Mono", monospace', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(progress)}%
          </span>
        </div>
        <div className="steps-track w-full" style={{ display: 'flex' }}>
          {PIPELINE_STEPS.map((_, i) => (
            <i
              key={i}
              className={i < stepIndex - 1 ? 'done' : i === stepIndex - 1 ? 'active' : ''}
              style={{ flex: 1, width: 'auto' }}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between relative">
        {project.deadline ? (
          <div
            className={cn(
              'flex items-center gap-1.5 text-xs',
              isUrgent ? 'font-semibold' : 'text-ds-text-3',
            )}
            style={isUrgent ? { color: '#F58E86' } : undefined}
          >
            {isUrgent ? <AlertTriangle size={11} /> : <Clock size={11} />}
            {days === 0
              ? "Échéance aujourd'hui"
              : days !== null && days < 0
                ? 'À déposer'
                : `J-${days}`}
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {/* C14 — actions de cycle de vie (1 clic) */}
          {isReady && (
            <button
              disabled={statusPending}
              onClick={(e) => { e.stopPropagation(); setStatus('soumis') }}
              title="Marquer cet AO comme déposé (date enregistrée)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              style={{ border: '1px solid rgba(186,205,234,.13)', color: '#9BA4B5' }}
            >
              <Send size={11} /> Déposé
            </button>
          )}
          {isDeposed && (
            <>
              <button
                disabled={statusPending}
                onClick={(e) => { e.stopPropagation(); setStatus('gagné') }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                style={{ border: '1px solid rgba(110,231,168,0.30)', color: '#6EE7A8' }}
              >
                <Trophy size={11} /> Gagné
              </button>
              <button
                disabled={statusPending}
                onClick={(e) => { e.stopPropagation(); setStatus('perdu') }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                style={{ border: '1px solid rgba(186,205,234,.13)', color: '#9BA4B5' }}
              >
                <X size={11} /> Perdu
              </button>
            </>
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
    </div>
  )
}
