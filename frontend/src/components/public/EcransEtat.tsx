import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '@/components/ui/page'
import { Bouton, classesBouton } from '@/components/ui/bouton'

/** Un écran qui dit ce qui se passe, en une phrase, et propose deux chemins : le premier est le geste attendu. */
function EcranChemins({ titre, phrase, vers, libelle, autre }: { titre: string; phrase: string; vers: string; libelle: string; autre: ReactNode }) {
  return (
    <Page etroite titre={titre} sousTitre={phrase}>
      <div className="flex flex-wrap gap-3">
        <Bouton asChild variante="principal" className="max-sm:w-full"><Link to={vers}>{libelle}</Link></Bouton>
        {autre}
      </div>
    </Page>
  )
}

/**
 * Adresse inconnue (404). Le même écran dans la coquille connectée et sur le site : ce qui se passe, en une phrase, et le
 * geste pour repartir. `connecte` choisit où mènent les deux liens.
 */
export function AdresseInconnue({ connecte }: { connecte: boolean }) {
  return (
    <EcranChemins titre="Cette adresse n’existe pas"
      phrase="La page a peut-être été déplacée, ou l’adresse contient une erreur. Vos dossiers ne sont pas touchés."
      vers={connecte ? '/dashboard' : '/'} libelle="Revenir à l’accueil"
      autre={<Link to={connecte ? '/projects' : '/login'} className={classesBouton('secondaire', 'max-sm:w-full')}>{connecte ? 'Voir mes appels d’offres' : 'Se connecter'}</Link>} />
  )
}

/** Appel d'offres introuvable (supprimé, ou adresse fausse) : à poser dans `routes/Project.tsx` à la place du renvoi muet. */
export function AOIntrouvable() {
  return (
    <EcranChemins titre="Cet appel d’offres est introuvable"
      phrase="Il a peut-être été supprimé, ou l’adresse contient une erreur. Vos autres dossiers ne sont pas touchés."
      vers="/projects" libelle="Voir mes appels d’offres"
      autre={<Link to="/dashboard" className={classesBouton('secondaire', 'max-sm:w-full')}>Revenir à l’accueil</Link>} />
  )
}
