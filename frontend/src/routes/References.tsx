import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { api } from '@/services/api'
import { formatMontant } from '@/lib/utils'
import { ReferenceTableSkeleton } from '@/components/skeletons'
import type { Reference } from '@/types'

export default function References() {
  const [_showForm, setShowForm] = useState(false)

  const { data: references = [], isLoading } = useQuery({
    queryKey: ['references'],
    queryFn: async () => {
      const { data } = await api.get<Reference[]>('/references')
      return data
    },
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24} style={{ color: '#0EA5E9' }} />
          <div>
            <h1 className="text-2xl font-bold text-ds-text">Références Chantiers</h1>
            <p className="text-sm text-ds-text-2">{references.length} références</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm font-medium py-2 px-4"
        >
          <Plus size={16} />
          Ajouter une référence
        </button>
      </div>

      <div className="glass-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead style={{ background: '#F8FAFC', borderBottom: '1px solid rgba(100,116,139,0.2)' }}>
            <tr>
              {['Année', 'Intitulé', 'Maître d\'ouvrage', 'Lot', 'Montant HT', 'Statut'].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-ds-text-2 uppercase tracking-wide px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ borderColor: 'rgba(100,116,139,0.1)' }} className="divide-y divide-current">
            {isLoading ? (
              <ReferenceTableSkeleton count={5} />
            ) : references.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-ds-text-3">
                  Aucune référence. Ajoutez vos chantiers passés.
                </td>
              </tr>
            ) : (
              references.map((ref) => (
                <tr key={ref.id} className="transition-colors" style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(14,165,233,0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3 text-ds-text-2">{ref.annee}</td>
                  <td className="px-4 py-3 font-medium text-ds-text">{ref.intitule}</td>
                  <td className="px-4 py-3 text-ds-text-2">{ref.maitre_ouvrage ?? '—'}</td>
                  <td className="px-4 py-3 text-ds-text-2">{ref.lot ?? '—'}</td>
                  <td className="px-4 py-3 text-ds-text-2">
                    {ref.montant_ht ? formatMontant(ref.montant_ht) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                      ref.statut === 'gagné'
                        ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                        : ref.statut === 'perdu'
                        ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
                        : 'bg-[#ECFEFF] text-[#0E7490] border-[#A5F3FC]'
                    }`}>
                      {ref.statut}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
