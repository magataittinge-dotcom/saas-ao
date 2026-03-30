import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { AOCard } from '@/components/dashboard/AOCard'
import { AlertCard } from '@/components/dashboard/AlertCard'
import { StatsBar } from '@/components/dashboard/StatsBar'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import type { Project, DashboardStats } from '@/types'

const defaultStats: DashboardStats = {
  projects_en_cours: 0,
  projects_soumis_ce_mois: 0,
  projects_gagnes: 0,
  taux_succes: 0,
  documents_expires: 0,
  documents_expirant_bientot: 0,
}

export default function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleDelete = async (id: string) => {
    await api.delete(`/projects/${id}`)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    setDeleteTarget(null)
  }

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await api.get<Project[]>('/projects')
      return data
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>('/dashboard/stats')
      return data
    },
  })

  const activeProjects = projects.filter(
    (p) => p.status === 'en_cours' || p.status === 'brouillon',
  )
  const firstName = user?.name?.split(' ')[0] ?? 'vous'

  return (
    <div className="space-y-8 animate-fade-in">
      {deleteTarget && (
        <DeleteConfirmModal
          title="Supprimer l'appel d'offres"
          message="Cette action est irréversible. Tous les documents, l'analyse IA, la checklist et le mémoire technique associés seront définitivement supprimés."
          projectName={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between animate-fade-in">
        <div>
          <h1 className="text-ds-text" style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            Bonjour, <span className="text-gradient">{firstName}</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            Voici l&apos;état de vos appels d&apos;offres
          </p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Nouvel AO
        </button>
      </div>

      {/* Stats */}
      <div className="animate-fade-in-delay-1">
        <StatsBar stats={stats ?? defaultStats} />
      </div>

      {/* Alerts */}
      <div className="animate-fade-in-delay-2">
        <AlertCard alerts={[]} />
      </div>

      {/* AO en cours */}
      <div className="animate-fade-in-delay-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-ds-text" style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            AO en cours
          </h2>
          {activeProjects.length > 0 && (
            <button
              onClick={() => navigate('/projects')}
              className="text-xs font-medium transition-colors"
              style={{ color: '#0EA5E9' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#7DD3FC')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#0EA5E9')}
            >
              Voir tous →
            </button>
          )}
        </div>

        {activeProjects.length === 0 ? (
          <div
            className="glass-card p-16 flex flex-col items-center gap-5 text-center"
            style={{ borderStyle: 'dashed', borderColor: 'rgba(14,165,233,0.18)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'rgba(14,165,233,0.08)',
                border: '1px solid rgba(14,165,233,0.15)',
                boxShadow: '0 0 24px rgba(14,165,233,0.08)',
              }}
            >
              <Plus size={26} style={{ color: '#0EA5E9' }} />
            </div>
            <div>
              <p
                className="font-semibold mb-1"
                style={{ color: '#E2E8F0', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
              >
                Aucun appel d&apos;offres en cours
              </p>
              <p className="text-xs" style={{ color: '#475569' }}>
                Créez votre premier AO pour commencer à utiliser l&apos;IA
              </p>
            </div>
            <button onClick={() => navigate('/projects/new')} className="btn-primary flex items-center gap-2">
              <Plus size={15} />
              Créer mon premier AO
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeProjects.map((project, i) => (
              <div
                key={project.id}
                className="animate-fade-in"
                style={{ animationDelay: `${0.30 + i * 0.07}s` }}
              >
                <AOCard project={project} onDelete={(id, name) => setDeleteTarget({ id, name })} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
