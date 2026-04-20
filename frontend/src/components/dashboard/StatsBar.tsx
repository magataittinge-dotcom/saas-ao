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
    iconBg: 'linear-gradient(135deg, #0EA5E9 0%, #0EA5E9 100%)',
    iconGlow: 'rgba(14,165,233,0.35)',
    accentColor: '#0EA5E9',
    suffix: '',
  },
  {
    key: 'projects_soumis_ce_mois' as keyof DashboardStats,
    label: 'Soumis ce mois',
    icon: Send,
    iconBg: 'linear-gradient(135deg, #10B981 0%, #0EA5E9 100%)',
    iconGlow: 'rgba(0,212,170,0.35)',
    accentColor: '#10B981',
    suffix: '',
  },
  {
    key: 'projects_gagnes' as keyof DashboardStats,
    label: 'Marchés gagnés',
    icon: Trophy,
    iconBg: 'linear-gradient(135deg, #10B981 0%, #10B981 100%)',
    iconGlow: 'rgba(16,185,129,0.35)',
    accentColor: '#10B981',
    suffix: '',
  },
  {
    key: 'taux_succes' as keyof DashboardStats,
    label: 'Taux de succès',
    icon: TrendingUp,
    iconBg: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
    iconGlow: 'rgba(245,158,11,0.35)',
    accentColor: '#F59E0B',
    suffix: '%',
  },
]

export function StatsBar({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {ITEMS.map(({ key, label, icon: Icon, iconBg, iconGlow, accentColor, suffix }, i) => {
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
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: iconBg, boxShadow: `0 4px 16px ${iconGlow}` }}
              >
                <Icon size={17} className="text-white" />
              </div>

              {/* Value */}
              <div className="text-right">
                <p
                  className="text-2xl font-bold leading-none text-white font-mono"
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
