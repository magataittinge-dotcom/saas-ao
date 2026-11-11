import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { Bouton } from '@/components/ui/bouton'
import { nomPlan } from '@/lib/offres'
import { prenomAffichable } from '@/lib/prenom'
import { Page, TitreSection } from '@/components/ui/page'
import { Carte, RangeeCarte } from '@/components/ui/carte'
import BasculeTheme, { ReglageAnimerFond } from '@/components/layout/BasculeTheme'

/** Une information du compte : son nom à gauche, sa valeur à droite. Un champ vide n'est pas un tiret : c'est un lien pour le remplir. */
function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <RangeeCarte className="justify-between gap-6">
      <span className="shrink-0 text-sm text-fg-2">{libelle}</span>
      <span className="min-w-0 break-words text-right text-sm font-medium text-fg">{children}</span>
    </RangeeCarte>
  )
}

/** Une rangée qui mène ailleurs : toute la rangée est la cible (52 px), un chevron dit qu'on change d'écran. */
function RangeeLien({ to, titre, detail }: { to: string; titre: string; detail?: ReactNode }) {
  return (
    <Link to={to} className="group flex min-h-[52px] items-center gap-3 border-t border-bord py-3 text-sm first:border-t-0">
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg group-hover:text-accent-text">{titre}</span>
        {detail && <span className="block text-fg-2">{detail}</span>}
      </span>
      <ChevronRight aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-3 group-hover:text-accent-text" />
    </Link>
  )
}

/**
 * Paramètres : le compte (et la déconnexion), l'entreprise (un lien : elle se modifie dans « Mon entreprise »), l'apparence
 * (le thème et le fond animé, les mêmes réglages que le menu du compte), l'abonnement (un lien : il a son écran) et les
 * outils de chantier. Aucun bouton plein : chaque réglage s'applique tout de suite.
 */
export default function Settings() {
  const { user, organization } = useAuthStore()
  // jamais le début d'un e-mail en guise de nom (lib/prenom.ts)
  const nom = prenomAffichable(user?.name, user?.email) ? user?.name : null
  const deconnexion = useLogout()
  // un champ vide est un champ à remplir : dit en mots, et UN seul lien vers Mon entreprise (la dernière rangée de la carte)
  const aRemplir = <span className="font-normal text-fg-3">À renseigner</span>

  return (
    <Page titre="Paramètres" sousTitre="Votre compte, l’apparence de Synorix et votre abonnement." etroite>
      <TitreSection className="!mt-0">Compte</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        {nom && <Ligne libelle="Nom">{nom}</Ligne>}
        {user?.email && <Ligne libelle="Adresse e-mail">{user.email}</Ligne>}
        <Ligne libelle="Rôle">{user?.role === 'member' ? 'Membre' : 'Administrateur'}</Ligne>
        {/* La déconnexion est aussi dans la page (le testeur la cherchait ici) : le même mot que dans le menu du compte. */}
        <RangeeCarte className="flex-wrap justify-between gap-x-6 gap-y-2" data-deconnexion="">
          <span className="text-sm text-fg-2">Quitter Synorix sur cet appareil</span>
          <Bouton variante="secondaire" onClick={() => { void deconnexion() }}><LogOut aria-hidden />Déconnexion</Bouton>
        </RangeeCarte>
      </Carte>

      <TitreSection>Entreprise</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        <Ligne libelle="Raison sociale">{organization?.name || aRemplir}</Ligne>
        <Ligne libelle="SIRET">{organization?.siret ? <span className="chiffres">{organization.siret}</span> : aRemplir}</Ligne>
        <RangeeLien to="/company" titre="Ouvrir Mon entreprise" detail="Identité, moyens, certifications et références." />
      </Carte>

      <TitreSection>Apparence</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        <RangeeCarte className="flex-wrap justify-between gap-x-6 gap-y-2 py-3">
          <span className="text-sm font-medium text-fg">Thème</span>
          <BasculeTheme className="w-full sm:w-80" />
        </RangeeCarte>
        <RangeeCarte>
          <ReglageAnimerFond className="w-full" />
        </RangeeCarte>
      </Carte>

      <TitreSection>Abonnement</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        <RangeeLien to="/settings/billing" titre={`Offre ${nomPlan(organization?.plan)}`} detail="Unités du mois, paiement, factures et résiliation." />
      </Carte>

      <TitreSection>Outils de chantier</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        <RangeeLien to="/outils" titre="Retenue de garantie" detail="Le montant retenu sur un marché et la date à laquelle il vous revient." />
      </Carte>
    </Page>
  )
}
