import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '@/components/ui/page'
import { Bouton, classesBouton } from '@/components/ui/bouton'

/** Un écran qui dit ce qui se passe, en une phrase, et propose deux chemins : le premier est le geste attendu. */
function EcranChemins({ titre, phrase, vers, libelle, autre, suite }: { titre: string; phrase: string; vers: string; libelle: string; autre?: ReactNode; suite?: ReactNode }) {
  return (
    <Page etroite titre={titre} sousTitre={<span className="block text-balance">{phrase}</span>}>
      {/* le fil d'aurore, comme sur l'écran d'erreur et hors connexion : la même signature sur tous les écrans d'état (jury, tour 3) */}
      <span aria-hidden className="fil-aurore mb-6 block" />
      <div className="flex flex-wrap gap-3">
        <Bouton asChild variante="principal" className="max-sm:w-full"><Link to={vers}>{libelle}</Link></Bouton>
        {autre}
      </div>
      {suite}
    </Page>
  )
}

/**
 * Adresse inconnue (404). Le même gabarit dans la coquille connectée et sur le site : ce qui se passe, en une phrase, et le
 * geste pour repartir. Connecté : la phrase rassure sur les dossiers, le second chemin mène à « Mes AO ». Visiteur (jury,
 * tour 1) : il n'a pas de dossier, la phrase ne lui en parle pas ; « Tarifs » et « Se connecter » sont dans l'en-tête du
 * site. Un seul chemin (jury, tour 3 : le slogan recollé sous un filet meublait, et « Voir comment ça marche » menait à la même page).
 */
export function AdresseInconnue({ connecte }: { connecte: boolean }) {
  if (connecte) {
    return (
      <EcranChemins titre="Cette adresse n’existe pas"
        phrase="Aucune page de Synorix ne correspond à cette adresse. Vos dossiers ne sont pas touchés."
        vers="/dashboard" libelle="Revenir à l’accueil"
        autre={<Link to="/projects" className={classesBouton('secondaire', 'max-sm:w-full')}>Voir mes appels d’offres</Link>} />
    )
  }
  return (
    <EcranChemins titre="Cette adresse n’existe pas" phrase="Aucune page de Synorix ne correspond à cette adresse."
      vers="/" libelle="Revenir à l’accueil" />
  )
}

/** Appel d'offres introuvable (le serveur répond qu'il n'existe pas) : posé dans `routes/Project.tsx`. Une phrase, une cause. */
export function AOIntrouvable() {
  return (
    <EcranChemins titre="Cet appel d’offres est introuvable"
      phrase="Aucun de vos appels d’offres ne correspond à cette adresse. Vos autres dossiers ne sont pas touchés."
      vers="/projects" libelle="Voir mes appels d’offres"
      autre={<Link to="/dashboard" className={classesBouton('secondaire', 'max-sm:w-full')}>Revenir à l’accueil</Link>} />
  )
}
