import { useState, useMemo } from 'react'
import { Plus, Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects } from '@/hooks/useProject'
import { daysUntil } from '@/lib/utils'
import { api } from '@/services/api'
import { AOCard } from '@/components/dashboard/AOCard'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import { ProjectCardGridSkeleton } from '@/components/skeletons'

type SortKey = 'deadline' | 'created_at' | 'name'
type StatusFilter = 'all' | 'active' | 'done'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'deadline', label: 'Deadline' },
  { key: 'created_at', label: 'Date création' },
  { key: 'name', label: 'Nom' },
]

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'En cours' },
  { key: 'done', label: 'Terminés' },
]

export default function Projects() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading } = useProjects()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('deadline')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const handleDelete = async (id: string) => {
    await api.delete(`/projects/${id}`)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    setDeleteTarget(null)
  }

  const filtered = useMemo(() => {
    let list = [...projects]

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }

    // Status filter
    if (filter === 'active') {
      list = list.filter((p) => p.status === 'en_cours' || p.status === 'brouillon')
    } else if (filter === 'done') {
      list = list.filter((p) => p.status === 'soumis' || p.status === 'gagné' || p.status === 'perdu')
    }

    // Sort
    list.sort((a, b) => {
      if (sort === 'deadline') {
        const da = a.deadline ? daysUntil(a.deadline) : 9999
        const db = b.deadline ? daysUntil(b.deadline) : 9999
        return da - db
      }
      if (sort === 'created_at') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return a.name.localeCompare(b.name, 'fr')
    })

    return list
  }, [projects, search, sort, filter])

  const activeCount = projects.filter((p) => p.status === 'en_cours' || p.status === 'brouillon').length

  return (
    <div className="space-y-5 animate-fade-in">
      {deleteTarget && (
        <DeleteConfirmModal
          title="Supprimer cet appel d'offres ?"
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-ds-text">Mes appels d&apos;offres</h1>
          <p className="text-sm mt-1 text-ds-text-2">
            {projects.length === 0
              ? 'Aucun projet pour le moment'
              : `${projects.length} projet${projects.length > 1 ? 's' : ''} · ${activeCount} en cours`}
          </p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="signature-btn touch-target shrink-0"
        >
          <Plus size={16} />
          Nouvel AO
        </button>
      </div>

      {/* Search + Filters bar */}
      {projects.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-ds-text-3" />
            <input
              type="text"
              placeholder="Rechercher un projet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full py-2.5 pl-9 pr-3 text-sm"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-ds-text-3 shrink-0">
              <ArrowUpDown size={12} />
              <span className="hidden sm:inline">Tri :</span>
            </div>
            <div className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(186,205,234,.13)' }}>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors touch-target"
                  style={{
                    background: sort === opt.key ? 'rgba(228,233,242,0.12)' : 'transparent',
                    color: sort === opt.key ? '#E4E9F2' : '#9BA4B5',
                    borderRight: '1px solid rgba(186,205,234,.13)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-ds-text-3 shrink-0">
              <SlidersHorizontal size={12} />
              <span className="hidden sm:inline">Filtre :</span>
            </div>
            <div className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(186,205,234,.13)' }}>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setFilter(opt.key)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors touch-target"
                  style={{
                    background: filter === opt.key ? 'rgba(228,233,242,0.12)' : 'transparent',
                    color: filter === opt.key ? '#E4E9F2' : '#9BA4B5',
                    borderRight: '1px solid rgba(186,205,234,.13)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <ProjectCardGridSkeleton count={6} />
      ) : projects.length === 0 ? (
        <div
          className="glass-card p-16 flex flex-col items-center gap-5 text-center"
          style={{ borderStyle: 'dashed', borderColor: 'rgba(228,233,242,0.15)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(228,233,242,0.10)' }}
          >
            <Plus size={28} className="text-ds-blue" />
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-ds-text-3 text-sm">
          Aucun projet ne correspond à votre recherche
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((project, i) => (
            <div key={project.id} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <AOCard project={project} onDelete={(id, name) => setDeleteTarget({ id, name })} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
