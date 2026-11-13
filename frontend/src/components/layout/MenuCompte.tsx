import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { CreditCard, LogOut, Settings, UserRound } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useLogout } from '@/hooks/useAuth'
import { useThemeEcran } from '@/lib/themeEcran'
import { useChoixTheme, type ChoixTheme } from '@/lib/theme'
import { prenomAffichable } from '@/lib/prenom'
import { initialeDuPrenom, nomDuCompte } from '@/lib/raisonSociale'
import { cn } from '@/lib/utils'
import { OPTIONS_THEME, classeSegmentTheme } from './BasculeTheme'

const ELEMENT = 'flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-3 text-sm font-medium text-fg outline-none transition-colors duration-fast ease-survol data-[highlighted]:bg-surface-1'

/**
 * Le rond du compte : la photo ; sans photo, l'initiale du prénom ; sans prénom, une icône de personne.
 * Jamais un tiret, jamais l'e-mail ni son début.
 */
export function RondCompte({ photo, initiale, onErreurPhoto }: { photo?: string | null; initiale?: string | null; onErreurPhoto?: () => void }) {
  if (photo) return <img src={photo} alt="" className="h-full w-full object-cover" onError={onErreurPhoto} />
  if (initiale) return <span data-initiale="">{initiale}</span>
  return <UserRound size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden data-rond-icone="" />
}

// Menu du compte (le rond, en pied de la barre d'icônes) : qui est connecté, Paramètres, Abonnement, le thème
// (« Système · Clair · Nuit »), le réglage « Animer le fond », la déconnexion. Le nom : le prénom (lib/prenom.ts) ou rien ;
// la raison sociale si le SIRET est vérifié, sinon « Mon entreprise » (lib/raisonSociale.ts) ; l'e-mail reste en petit.
export default function MenuCompte() {
  const { user, organization } = useAuthStore()
  const logout = useLogout()
  const theme = useThemeEcran()
  const [choix, choisir] = useChoixTheme()
  const animerFond = useUIStore((s) => s.animerFond)
  const setAnimerFond = useUIStore((s) => s.setAnimerFond)
  const prenom = prenomAffichable(user?.name, user?.email)
  // sans raison sociale vérifiée, l'en-tête dit « Votre compte » : « Mon entreprise » est le nom d'une page (jury, tour 1)
  const entreprise = nomDuCompte(organization)
  const { user: compte } = useUser()
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null)
  const photo = compte?.hasImage && compte.imageUrl !== photoEnEchec ? compte.imageUrl : null

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={prenom ? `Menu du compte — ${prenom}` : 'Menu du compte'}
        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-pilule border border-bord-champ bg-surface-1 text-sm font-semibold text-fg-2 transition-colors duration-fast ease-survol hover:bg-surface-2 hover:text-fg active:scale-[.98] data-[state=open]:bg-surface-2 data-[state=open]:text-fg">
        <RondCompte photo={photo} initiale={initialeDuPrenom(prenom)} onErreurPhoto={() => setPhotoEnEchec(photo)} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content side="right" align="end" sideOffset={24} collisionPadding={12} data-theme={theme}
          className="menu-flottant z-50 w-72 rounded-carte border border-bord bg-surface-pop p-1.5 text-fg shadow-flottant">
          <div className="px-3 py-2">
            {/* le nom, l'adresse, puis l'entreprise si elle est vérifiée (jury, tour 3 : « Votre compte » entre le nom et l'adresse) */}
            {prenom && <p className="truncate text-sm font-semibold">{prenom}</p>}
            {!prenom && <p className="truncate text-sm font-semibold">{entreprise}</p>}
            {user?.email && <p className="truncate text-xs text-fg-3">{user.email}</p>}
            {prenom && nomDuCompte(organization, null) && <p className="truncate text-xs text-fg-3">{nomDuCompte(organization, null)}</p>}
          </div>
          <Menu.Separator className="my-1 h-px bg-bord" />
          <Menu.Item asChild>
            <Link to="/settings" className={ELEMENT}><Settings size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Paramètres</Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link to="/settings/billing" className={ELEMENT}><CreditCard size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Abonnement</Link>
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-bord" />
          <Menu.Label className="px-3 pb-1 pt-1.5 text-xs font-medium text-fg-3">Thème</Menu.Label>
          <Menu.RadioGroup value={choix} onValueChange={(v) => choisir(v as ChoixTheme)} className="mx-1.5 mb-1 flex gap-1 rounded-lg border border-bord p-1">
            {OPTIONS_THEME.map(({ valeur, libelle, icone: Icone }) => (
              <Menu.RadioItem key={valeur} value={valeur} onSelect={(e) => e.preventDefault()}
                className={cn(classeSegmentTheme(choix === valeur), 'cursor-pointer select-none data-[highlighted]:bg-surface-1 data-[highlighted]:text-fg', choix === valeur && 'data-[highlighted]:bg-surface-2')}>
                <Icone size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
                {libelle}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.CheckboxItem checked={animerFond} onCheckedChange={(v) => setAnimerFond(v === true)} onSelect={(e) => e.preventDefault()} className={cn(ELEMENT, 'justify-between')}>
            Animer le fond
            <span aria-hidden className={cn('relative h-6 w-10 shrink-0 rounded-pilule border transition-colors duration-survol ease-survol', animerFond ? 'border-accent-ui bg-accent-ui' : 'border-bord-champ bg-surface-1')}>
              <span className={cn('absolute left-0.5 top-0.5 size-[18px] rounded-pilule bg-surface-0 shadow-card transition-transform duration-survol ease-survol', animerFond && 'translate-x-4')} />
            </span>
          </Menu.CheckboxItem>
          <Menu.Separator className="my-1 h-px bg-bord" />
          <Menu.Item onSelect={() => { void logout() }} className={ELEMENT}>
            <LogOut size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />Déconnexion
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
