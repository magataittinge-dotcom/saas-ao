import { FolderOpen, Send, Trophy, TrendingUp } from 'lucide-react'
import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats
}

const ITEMS = [
  {
    key: 'projects_en_cours' as keyof DashboardStats,
    label: 'AO en cours',
    icon: FolderOpen,
    accentColor: '#22D3EE',
    suffix: '',
  },
  {
    key: 'projects_soumis_ce_mois' as keyof DashboardStats,
    label: 'Soumis ce mois',
    icon: Send,
    accentColor: '#22D3EE',
    suffix: '',
  },
  {
    key: 'projects_gagnes' as keyof DashboardStats,
    label: 'Marchés gagnés',
    icon: Trophy,
    accentColor: '#34D399',
    suffix: '',
  },
  {
    key: 'taux_succes' as keyof DashboardStats,
    label: 'Taux de succès',
    icon: TrendingUp,
    accentColor: '#9AA3AE',
    suffix: '%',
  },
]

export function StatsBar({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {ITEMS.map(({ key, label, icon: Icon, accentColor, suffix }, i) => {
        const value = stats[key] ?? 0

        return (
          <div
            key={key}
            className="glass-card p-5 relative overflow-hidden group animate-fade-in"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            {/* Accent top-line */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
              style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
            />

            {/* Radial glow */}
            <div
              className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-[0.10] group-hover:opacity-[0.18] transition-opacity blur-xl"
              style={{ background: accentColor }}
            />

            <div className="flex items-start justify-between relative">
              {/* Icon — puce graphite éclairée, icône teintée (Edge) */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'radial-gradient(120% 80% at 50% 100%, rgba(34,211,238,0.10), transparent 65%), var(--edge-graphite)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                }}
              >
                <Icon size={17} style={{ color: accentColor }} />
              </div>

              {/* Value */}
              <div className="text-right">
                <p
                  className="edge-data text-2xl font-bold leading-none text-ds-text"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {value}{suffix}
                </p>
              </div>
            </div>

            <p className="text-xs text-ds-text-2 mt-3 font-medium">{label}</p>
          </div>
        )
      })}
    </div>
  )
}
