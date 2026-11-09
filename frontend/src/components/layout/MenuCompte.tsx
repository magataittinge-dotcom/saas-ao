import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { CreditCard, LogOut, Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { useThemeEcran } from '@/lib/themeEcran'
import { prenomAffichable } from '@/lib/prenom'
import { initialesDuPrenom, raisonSociale } from '@/lib/raisonSociale'

const ELEMENT = 'flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-3 text-sm font-medium text-fg outline-none transition-colors duration-base data-[highlighted]:bg-surface-2'

// Menu du compte (la photo, en pied de la barre d'icônes) : Paramètres, Abonnement et Déconnexion.
// La déconnexion ne figure plus dans la barre elle-même. Sans photo, ou si elle ne charge pas, les initiales du prénom.
// Jamais le début de l'e-mail comme nom : le prénom (lib/prenom.ts) ou rien ; la raison sociale si le SIRET est vérifié,
// sinon « Mon entreprise » (lib/raisonSociale.ts) ; l'e-mail reste en petit.
export default function MenuCompte() {
  const { user, organization } = useAuthStore()
  const logout = useLogout()
  const theme = useThemeEcran()
  const prenom = prenomAffichable(user?.name, user?.email)
  const entreprise = raisonSociale(organization)
  const initiales = initialesDuPrenom(prenom)
  const { user: compte } = useUser()
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null)
  const photo = compte?.hasImage && compte.imageUrl !== photoEnEchec ? compte.imageUrl : null

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={prenom ? `Menu du compte — ${prenom}` : 'Menu du compte'}
        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-pilule border border-bord-champ bg-surface-1 text-sm font-semibold text-fg-2 transition-colors duration-base hover:border-accent-ui data-[state=open]:border-accent-ui">
        {photo
          ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setPhotoEnEchec(photo)} />
          : initiales}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content side="right" align="end" sideOffset={12} collisionPadding={12} data-theme={theme}
          className="z-50 w-64 rounded-carte border border-bord bg-surface-pop p-1.5 text-fg shadow-flottant">
          <div className="px-3 py-2">
            {prenom && <p className="truncate text-sm font-semibold">{prenom}</p>}
            <p className={prenom ? 'truncate text-[13px] text-fg-2' : 'truncate text-sm font-semibold'}>{entreprise}</p>
            {user?.email && <p className="truncate text-xs text-fg-3">{user.email}</p>}
          </div>
          <Menu.Separator className="my-1 h-px bg-bord" />
          <Menu.Item asChild>
            <Link to="/settings" className={ELEMENT}><Settings size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Paramètres</Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link to="/settings/billing" className={ELEMENT}><CreditCard size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Abonnement</Link>
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-bord" />
          <Menu.Item onSelect={() => { void logout() }} className={ELEMENT}>
            <LogOut size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Déconnexion
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
