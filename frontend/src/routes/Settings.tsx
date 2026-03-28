import { Settings as SettingsIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export default function Settings() {
  const { user, organization } = useAuthStore()

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <SettingsIcon size={24} style={{ color: '#0EA5E9' }} />
        <h1 className="text-2xl font-bold text-ds-text">Paramètres</h1>
      </div>

      <div className="glass-card divide-y" style={{ borderColor: 'rgba(100,116,139,0.15)' }}>
        <div className="p-5" style={{ borderColor: 'rgba(100,116,139,0.15)' }}>
          <h2 className="font-semibold text-ds-text mb-3">Mon compte</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ds-text-2">Nom</dt>
              <dd className="font-medium text-ds-text">{user?.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ds-text-2">Email</dt>
              <dd className="font-medium text-ds-text">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ds-text-2">Rôle</dt>
              <dd className="font-medium text-ds-text capitalize">{user?.role}</dd>
            </div>
          </dl>
        </div>

        <div className="p-5" style={{ borderColor: 'rgba(100,116,139,0.15)' }}>
          <h2 className="font-semibold text-ds-text mb-3">Abonnement</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ds-text-2">Plan actuel</dt>
              <dd>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 capitalize">
                  {organization?.plan}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ds-text-2">Tarif</dt>
              <dd className="font-medium text-ds-text">
                {organization?.plan === 'pro' ? '249€' : '399€'}/mois HT
              </dd>
            </div>
          </dl>
          <button className="mt-4 text-sm transition-colors" style={{ color: '#0EA5E9' }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            Gérer mon abonnement →
          </button>
        </div>
      </div>
    </div>
  )
}
