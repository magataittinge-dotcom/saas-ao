import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, AlertCircle, Clock, Upload, Check } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import type { Project, ChecklistItem, ChecklistStatus } from '@/types'

const STATUS_CONFIG: Record<ChecklistStatus, {
  icon: React.ReactNode
  bg: string
  border: string
}> = {
  present: {
    icon: <CheckCircle2 size={18} style={{ color: '#10B981' }} className="shrink-0" />,
    bg: 'rgba(16,185,129,0.06)',
    border: 'rgba(16,185,129,0.20)',
  },
  manquant: {
    icon: <XCircle size={18} style={{ color: '#EF4444' }} className="shrink-0" />,
    bg: 'rgba(239,68,68,0.06)',
    border: 'rgba(239,68,68,0.20)',
  },
  expire: {
    icon: <AlertCircle size={18} style={{ color: '#EF4444' }} className="shrink-0" />,
    bg: 'rgba(239,68,68,0.06)',
    border: 'rgba(239,68,68,0.20)',
  },
  expiration_proche: {
    icon: <Clock size={18} style={{ color: '#F59E0B' }} className="shrink-0" />,
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.20)',
  },
}

interface Props { project: Project }

export default function StepCandidat({ project }: Props) {
  const navigate = useNavigate()
  const completeStep = useCompleteStep(project.id)
  const isAlreadyDone = project.completed_steps?.['4'] === true

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist', project.id],
    queryFn: async () => {
      const { data } = await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)
      return data
    },
  })

  const present = items.filter((i) => i.status === 'present').length
  const total   = items.length

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ds-text">Étape 4 — Checklist Candidature</h2>
        <p className="text-sm text-ds-text-2 mt-1">
          {present}/{total} documents présents et valides
        </p>
      </div>

      {/* Progress mini */}
      {total > 0 && (
        <div className="progress-track h-1.5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.round((present / total) * 100)}%`,
              background: present === total
                ? 'linear-gradient(90deg, #10B981, #0EA5E9)'
                : 'linear-gradient(90deg, #0EA5E9, #3B82F6)',
            }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-ds-text-3">Chargement...</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const cfg = STATUS_CONFIG[item.status]
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border transition-all duration-150"
                style={{ background: cfg.bg, borderColor: cfg.border }}
              >
                <div className="flex items-center gap-3">
                  {cfg.icon}
                  <div>
                    <p className="text-sm font-medium text-ds-text">{item.document_type_required}</p>
                    {item.details && (
                      <p className="text-xs text-ds-text-2 mt-0.5">{item.details}</p>
                    )}
                    {item.source_in_rc && (
                      <p className="text-xs text-ds-text-3 mt-0.5">Requis : {item.source_in_rc}</p>
                    )}
                  </div>
                </div>
                {(item.status === 'manquant' || item.status === 'expire') && (
                  <button
                    className="flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1 transition-colors"
                    style={{
                      color: '#38BDF8',
                      border: '1px solid rgba(14,165,233,0.25)',
                      background: 'rgba(14,165,233,0.08)',
                    }}
                  >
                    <Upload size={12} />
                    {item.status === 'expire' ? 'Mettre à jour' : 'Uploader'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-end pt-2">
        {isAlreadyDone ? (
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: '#34D399' }}
            >
              <Check size={15} strokeWidth={2.5} />
              Candidature validée
            </div>
            <button
              onClick={() => navigate(`/projects/${project.id}/memoire`)}
              className="btn-primary px-6 py-2.5"
            >
              Aller au mémoire →
            </button>
          </div>
        ) : (
          <button
            onClick={() =>
              completeStep.mutate(4, {
                onSuccess: () => navigate(`/projects/${project.id}/memoire`),
              })
            }
            disabled={completeStep.isPending}
            className="btn-primary px-6 py-2.5 flex items-center gap-2"
          >
            {completeStep.isPending ? (
              <span className="w-4 h-4 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#fff' }} />
            ) : (
              <Check size={16} strokeWidth={2.5} />
            )}
            Candidature complète ✓
          </button>
        )}
      </div>
    </div>
  )
}
