import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, ArrowRight, Send, Trash2, Trophy, X } from 'lucide-react'
import { api } from '@/services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { avancementAO, echeanceAO, etatEcheance } from '@/lib/echeance'
import type { Project } from '@/types'

import { PIPELINE_STEPS } from './PipelineRail'

type Ton = 'neutral' | 'accent' | 'success' | 'danger'
// Étiquette de statut (Badge du socle) et couleur du filet du haut, par jeton.
const STATUS_CONFIG: Record<string, { label: string; ton: Ton; filet: string }> = {
  brouillon:  { label: 'Brouillon',            ton: 'neutral', filet: 'from-fg-3' },
  en_cours:   { label: 'En cours',             ton: 'accent',  filet: 'from-accent-text' },
  analyzed:   { label: 'Analysé',              ton: 'accent',  filet: 'from-accent-text' },
  sans_suite: { label: 'Analysé — sans suite', ton: 'neutral', filet: 'from-fg-3' },
  soumis:     { label: 'Déposé',               ton: 'neutral', filet: 'from-fg-2' },
  gagné:      { label: 'Gagné',                ton: 'success', filet: 'from-success' },
  perdu:      { label: 'Perdu',                ton: 'danger',  filet: 'from-danger' },
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

  // 1.14 — échéance et avancement : les fonctions communes (lib/echeance.ts)
  const echeance = etatEcheance(echeanceAO(project))
  const isUrgent = echeance.etat === 'proche' || echeance.etat === 'aujourdhui'
  const { etape: stepIndex, total: nbEtapes } = avancementAO(project.current_step)
  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.brouillon
  const filet = isUrgent ? 'from-warning' : status.filet

  return (
    <Card
      interactive
      className={cn('relative flex flex-col gap-4 overflow-hidden p-5', isUrgent && 'ring-1 ring-warning-border')}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Filet du haut : la couleur du statut (ou l'échéance proche) */}
      <div aria-hidden className={cn('absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r to-transparent opacity-80', filet)} />

      {/* En-tête */}
      <div className="relative flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug text-fg">
          {project.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={status.ton}>{status.label}</Badge>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDelete(project.id, project.name) }}
              className="size-8 text-fg-3 hover:text-danger [@media(pointer:coarse)]:size-11"
              title="Supprimer cet AO"
              aria-label="Supprimer cet AO"
            >
              <Trash2 size={13} aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {/* Maître d'ouvrage */}
      {project.maitre_ouvrage && (
        <p className="relative -mt-2 truncate text-xs text-fg-2">{project.maitre_ouvrage}</p>
      )}

      {/* Date et lot */}
      <div className="relative -mt-2 flex items-center gap-3 text-xs text-fg-2">
        <span>
          {new Date(project.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {project.selected_lot_name && (
          <span className="truncate text-fg">{project.selected_lot_name}</span>
        )}
      </div>

      {/* Avancement */}
      <div className="relative">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-fg-3">{PIPELINE_STEPS[stepIndex - 1]}</span>
          <span className="font-mono font-medium tabular-nums text-fg-2">
            Étape {stepIndex} sur {nbEtapes}
          </span>
        </div>
        <div className="flex w-full gap-[3px]">
          {PIPELINE_STEPS.map((_, i) => (
            <i
              key={i}
              className={cn('h-[3px] flex-1 rounded-full', i < stepIndex - 1 ? 'bg-fg' : i === stepIndex - 1 ? 'bg-accent-ui' : 'bg-fg-disabled')}
            />
          ))}
        </div>
      </div>

      {/* Pied */}
      <div className="relative flex items-center justify-between">
        {echeance.etat !== 'sans_date' ? (
          <div className={cn('flex items-center gap-1.5 text-xs', isUrgent ? 'font-semibold text-warning' : 'text-fg-3')}>
            {isUrgent ? <AlertTriangle size={11} aria-hidden /> : <Clock size={11} aria-hidden />}
            {echeance.libelle}
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {/* C14 — actions de cycle de vie (1 clic) */}
          {isReady && (
            <Button
              variant="outline"
              size="sm"
              disabled={statusPending}
              onClick={(e) => { e.stopPropagation(); setStatus('soumis') }}
              title="Marquer cet AO comme déposé (date enregistrée)"
              className="h-8 gap-1 px-2 text-xs text-fg-2"
            >
              <Send size={11} aria-hidden /> Déposé
            </Button>
          )}
          {isDeposed && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={statusPending}
                onClick={(e) => { e.stopPropagation(); setStatus('gagné') }}
                className="h-8 gap-1 border-success-border px-2 text-xs text-success hover:bg-success-bg"
              >
                <Trophy size={11} aria-hidden /> Gagné
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={statusPending}
                onClick={(e) => { e.stopPropagation(); setStatus('perdu') }}
                className="h-8 gap-1 px-2 text-xs text-fg-2"
              >
                <X size={11} aria-hidden /> Perdu
              </Button>
            </>
          )}
          <Button
            variant="link"
            size="sm"
            className="h-8 gap-1 text-xs [@media(pointer:coarse)]:min-h-11"
            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`) }}
          >
            Continuer
            <ArrowRight size={12} aria-hidden />
          </Button>
        </div>
      </div>
    </Card>
  )
}
