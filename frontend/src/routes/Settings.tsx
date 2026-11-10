import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
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

const LIEN = 'font-medium text-accent-text underline-offset-4 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center'

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
 * Paramètres : le compte, l'entreprise (un lien : elle se modifie dans « Mon entreprise »), l'apparence (le thème et le
 * fond animé, les mêmes réglages que le menu du compte), l'abonnement (un lien : il a son écran) et les outils. Aucun
 * bouton plein : chaque réglage s'applique tout de suite.
 */
export default function Settings() {
  const { user, organization } = useAuthStore()
  // jamais le début d'un e-mail en guise de nom (lib/prenom.ts)
  const nom = prenomAffichable(user?.name, user?.email) ? user?.name : null
  const renseigner = <Link to="/company" className={LIEN}>Renseigner</Link>

  return (
    <Page titre="Paramètres" sousTitre="Votre compte, l’apparence de Synorix et votre abonnement." etroite>
      <TitreSection className="!mt-0">Compte</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        {nom && <Ligne libelle="Nom">{nom}</Ligne>}
        {user?.email && <Ligne libelle="Adresse e-mail">{user.email}</Ligne>}
        <Ligne libelle="Rôle">{user?.role === 'member' ? 'Membre' : 'Administrateur'}</Ligne>
      </Carte>

      <TitreSection action={<Link to="/company" className={`text-sm ${LIEN}`}>Ouvrir Mon entreprise</Link>}>Entreprise</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        <Ligne libelle="Raison sociale">{organization?.name || renseigner}</Ligne>
        <Ligne libelle="SIRET">{organization?.siret ? <span className="chiffres">{organization.siret}</span> : renseigner}</Ligne>
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

      <TitreSection>Abonnement et outils</TitreSection>
      <Carte sansMarge className="px-5 sm:px-6">
        <RangeeLien to="/settings/billing" titre="Abonnement" detail={`Offre ${nomPlan(organization?.plan)} : unités du mois, offres et factures.`} />
        <RangeeLien to="/outils" titre="Retenue de garantie" detail="Le montant retenu sur un marché et la date à laquelle il vous revient." />
      </Carte>
    </Page>
  )
}
