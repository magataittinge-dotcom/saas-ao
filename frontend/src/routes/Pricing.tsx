import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GrilleOffres from '@/components/offres/GrilleOffres'
import CoquillePublique, { NavSite } from '@/components/public/CoquillePublique'
import { Page } from '@/components/ui/page'
import { classesBouton } from '@/components/ui/bouton'
import { ESSAI } from '@/lib/offres'

/**
 * Tarifs : la coquille du site (logo, retour, pied de page) et la grille telle que le code la donne (lib/offres.ts,
 * components/offres/GrilleOffres.tsx). Aucun prix ni aucune offre n'est écrit ici.
 */
export default function Pricing() {
  return (
    <CoquillePublique nav={<NavSite tarifs={false} />}>
      <Page titre="Tarifs" sousTitre="Trois offres, les mêmes fonctions : seuls les quotas mensuels changent."
        avant={<Link to="/" className={classesBouton('lien', 'mb-4')}><ArrowLeft aria-hidden strokeWidth={1.75} />Retour au site</Link>}
        action={<Link to="/register" className={classesBouton('principal', 'max-md:w-full')}>Créer mon compte : {ESSAI.ao} appel d’offres offert</Link>}>
        <h2 className="sr-only">Les trois offres</h2>
        <GrilleOffres action={(offre) => (
          <Link to={`/register?plan=${offre.id}`} className={classesBouton('secondaire', 'w-full')}>Commencer avec {offre.nom}</Link>
        )} />
        <p className="mt-8 text-sm text-fg-2">Sans engagement · Résiliable à tout moment · Support inclus</p>
      </Page>
    </CoquillePublique>
  )
}
