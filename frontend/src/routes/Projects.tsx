import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects } from '@/hooks/useProject'
import { api } from '@/services/api'
import { AOCard } from '@/components/dashboard/AOCard'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'

export default function Projects() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading } = useProjects()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleDelete = async (id: string) => {
    await api.delete(`/projects/${id}`)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {deleteTarget && (
        <DeleteConfirmModal
          title="Supprimer l'appel d'offres"
          message="Cette action est irréversible. Tous les documents, l'analyse IA, la checklist et le mémoire technique associés seront définitivement supprimés."
          projectName={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-ds-text">Mes appels d&apos;offres</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            {projects.length === 0
              ? 'Aucun projet pour le moment'
              : `${projects.length} projet${projects.length > 1 ? 's' : ''} · ${projects.filter(p => p.status === 'en_cours' || p.status === 'brouillon').length} en cours`}
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

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div
            className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#0EA5E9' }}
          />
        </div>
      ) : projects.length === 0 ? (
        <div
          className="glass-card p-16 flex flex-col items-center gap-5 text-center"
          style={{ borderStyle: 'dashed', borderColor: 'rgba(14,165,233,0.15)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(14,165,233,0.10)' }}
          >
            <Plus size={28} style={{ color: '#0EA5E9' }} />
          </div>
          <div>
            <p className="text-ds-text font-semibold mb-1">Aucun appel d&apos;offres pour l&apos;instant</p>
            <p className="text-ds-text-2 text-xs">Créez votre premier projet pour démarrer</p>
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            className="btn-primary flex items-center gap-2 mx-auto"
          >
            <Plus size={16} />
            Créer mon premier AO
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project, i) => (
            <div key={project.id} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <AOCard project={project} onDelete={(id, name) => setDeleteTarget({ id, name })} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
