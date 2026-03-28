import { useQuery } from '@tanstack/react-query'
import { Users, Plus } from 'lucide-react'
import { api } from '@/services/api'
import type { TeamMember } from '@/types'

export default function Team() {
  const { data: members = [] } = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const { data } = await api.get<TeamMember[]>('/team')
      return data
    },
  })

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={24} style={{ color: '#0EA5E9' }} />
          <h1 className="text-2xl font-bold text-ds-text">Équipe</h1>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm font-medium py-2 px-4">
          <Plus size={16} />
          Ajouter un membre
        </button>
      </div>

      <div className="space-y-3">
        {members.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl text-ds-text-3"
            style={{
              border: '2px dashed rgba(100,116,139,0.3)',
              background: 'rgba(15,23,42,0.4)',
            }}
          >
            <Users size={36} className="mx-auto mb-3 opacity-30" />
            <p>Ajoutez les membres de votre équipe d'encadrement</p>
            <p className="text-sm mt-1 text-ds-text-3">Ils seront utilisés comme interlocuteurs dans vos mémoires techniques</p>
          </div>
        ) : (
          members.map((member) => (
            <div key={member.id} className="glass-card flex items-center gap-4 p-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm"
                style={{ background: 'rgba(14,165,233,0.15)', color: '#0EA5E9' }}
              >
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-medium text-ds-text">{member.name}</p>
                <p className="text-sm text-ds-text-2">{member.role}</p>
              </div>
              {member.experience_years && (
                <span className="text-xs text-ds-text-3">{member.experience_years} ans exp.</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
