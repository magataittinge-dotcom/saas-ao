import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, AlertCircle, Clock, Upload, Check, AlertTriangle } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import type { Project, ChecklistItem, ChecklistStatus } from '@/types'

const STATUS_CONFIG: Record<ChecklistStatus, {
  icon: ReactNode
  bg: string
  border: string
}> = {
  present: {
    icon: <CheckCircle2 size={18} style={{ color: '#10B981' }} className="shrink-0" />,
    bg: 'rgba(16,185,129,0.06)',
    border: 'rgba(16,185,129,0.18)',
  },
  manquant: {
    icon: <XCircle size={18} style={{ color: '#EF4444' }} className="shrink-0" />,
    bg: 'rgba(239,68,68,0.06)',
    border: 'rgba(239,68,68,0.18)',
  },
  expire: {
    icon: <AlertCircle size={18} style={{ color: '#F59E0B' }} className="shrink-0" />,
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.22)',
  },
  expiration_proche: {
    icon: <Clock size={18} style={{ color: '#F59E0B' }} className="shrink-0" />,
    bg: 'rgba(245,158,11,0.05)',
    border: 'rgba(245,158,11,0.18)',
  },
}

interface Props { project: Project }

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const cfg = STATUS_CONFIG[item.status]
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border transition-all duration-200"
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
          className="flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1 transition-all duration-200 hover:opacity-80"
          style={{
            color: '#60A5FA',
            border: '1px solid rgba(59,130,246,0.25)',
            background: 'rgba(59,130,246,0.08)',
          }}
        >
          <Upload size={12} />
          {item.status === 'expire' ? 'Mettre à jour' : 'Uploader'}
        </button>
      )}
    </div>
  )
}

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

  const present   = items.filter((i) => i.status === 'present').length
  const expired   = items.filter((i) => i.status === 'expire')
  const expireSoon = items.filter((i) => i.status === 'expiration_proche')
  const missing   = items.filter((i) => i.status === 'manquant')
  const ok        = items.filter((i) => i.status === 'present')
  const total     = items.length
  const pct       = total > 0 ? Math.round((present / total) * 100) : 0
  const allOk     = total > 0 && present === total

  return (
    <div className="glass-card p-6 space-y-6">
      {/* Header + progress */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-ds-text">Checklist candidature</h2>
            <p className="text-sm text-ds-text-2 mt-0.5">
              Vérification des documents requis pour soumettre votre dossier
            </p>
          </div>
          {total > 0 && (
            <div className="text-right shrink-0 ml-4">
              <div
                className="text-2xl font-bold leading-none"
                style={{ fontFamily: '"JetBrains Mono", monospace', color: allOk ? '#10B981' : '#3B82F6' }}
              >
                {present}<span className="text-sm text-ds-text-3 font-normal">/{total}</span>
              </div>
              <div className="text-xs text-ds-text-3 mt-0.5">documents OK</div>
            </div>
          )}
        </div>

        {total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-ds-text-3 mb-1.5">
              <span>{pct}% conforme</span>
              <span>{missing.length + expired.length} action{missing.length + expired.length !== 1 ? 's' : ''} requise{missing.length + expired.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="progress-track h-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: allOk
                    ? 'linear-gradient(90deg, #10B981, #3B82F6)'
                    : pct >= 60
                    ? 'linear-gradient(90deg, #3B82F6, #60A5FA)'
                    : 'linear-gradient(90deg, #F59E0B, #EF4444)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-ds-text-3">Chargement...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-ds-text-3 text-sm">
          Aucun document requis détecté dans le DCE
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Documents expirés — alert section ─────────────────── */}
          {expired.length > 0 && (
            <div>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-t-lg"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderBottom: 'none' }}
              >
                <AlertTriangle size={14} style={{ color: '#F59E0B' }} />
                <span className="text-xs font-semibold" style={{ color: '#FCD34D' }}>
                  Documents expirés ({expired.length}) — mise à jour requise
                </span>
              </div>
              <div
                className="space-y-1 p-2 rounded-b-lg"
                style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)', borderTop: 'none' }}
              >
                {expired.map((item) => <ChecklistRow key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {/* ── Documents manquants ──────────────────────────────── */}
          {missing.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ds-text-3 uppercase tracking-wide mb-2">
                Documents manquants ({missing.length})
              </h3>
              <div className="space-y-1.5">
                {missing.map((item) => <ChecklistRow key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {/* ── Expiration proche ────────────────────────────────── */}
          {expireSoon.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ds-text-3 uppercase tracking-wide mb-2">
                Expiration proche ({expireSoon.length})
              </h3>
              <div className="space-y-1.5">
                {expireSoon.map((item) => <ChecklistRow key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {/* ── Documents présents ──────────────────────────────── */}
          {ok.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ds-text-3 uppercase tracking-wide mb-2">
                Documents présents et valides ({ok.length})
              </h3>
              <div className="space-y-1.5">
                {ok.map((item) => <ChecklistRow key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end pt-2" style={{ borderTop: '1px solid rgba(59,130,246,0.08)' }}>
        {isAlreadyDone ? (
          <div className="flex items-center gap-3">
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
