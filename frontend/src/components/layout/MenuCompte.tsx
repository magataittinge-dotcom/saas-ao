import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { CreditCard, LogOut, Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { useThemeEcran } from '@/lib/themeEcran'

const ELEMENT = 'flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-3 text-sm font-medium text-fg outline-none transition-colors duration-base data-[highlighted]:bg-surface-2'

// Menu du compte (la photo, en pied de la barre d'icônes) : Paramètres, Abonnement et Déconnexion.
// La déconnexion ne figure plus dans la barre elle-même. Sans photo, ou si elle ne charge pas, les initiales.
export default function MenuCompte() {
  const { user } = useAuthStore()
  const logout = useLogout()
  const theme = useThemeEcran()
  const nom = user?.name ?? 'Utilisateur'
  const initiales = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'
  const { user: compte } = useUser()
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null)
  const photo = compte?.hasImage && compte.imageUrl !== photoEnEchec ? compte.imageUrl : null

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`Menu du compte — ${nom}`}
        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-pilule border border-bord-2 bg-surface-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent-ui data-[state=open]:border-accent-ui">
        {photo
          ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setPhotoEnEchec(photo)} />
          : initiales}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content side="right" align="end" sideOffset={12} collisionPadding={12} data-theme={theme}
          className="z-50 w-64 rounded-carte border border-bord bg-surface-pop p-1.5 text-fg shadow-toast">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{nom}</p>
            {user?.email && <p className="truncate text-xs text-fg-2">{user.email}</p>}
          </div>
          <Menu.Separator className="my-1 h-px bg-bord-2" />
          <Menu.Item asChild>
            <Link to="/settings" className={ELEMENT}><Settings size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Paramètres</Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link to="/settings/billing" className={ELEMENT}><CreditCard size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Abonnement</Link>
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-bord-2" />
          <Menu.Item onSelect={() => { void logout() }} className={ELEMENT}>
            <LogOut size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Déconnexion
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
