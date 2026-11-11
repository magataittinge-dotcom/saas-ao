import { SignUp } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import EcranCompte, { VerificationHumaine } from '@/components/public/EcranCompte'

const LIEN = 'font-medium text-accent-text underline underline-offset-4'

/**
 * Inscription : le titre de la page et l'offre (« Votre premier appel d'offres est offert. ») à gauche, la carte Clerk
 * habillée aux jetons à droite (components/public/EcranCompte.tsx). Pendant la vérification anti-robot, la page garde sa
 * coquille et son titre et dit ce qui se passe. Sous la carte : les conditions que l'on accepte en créant le compte.
 */
export default function Register() {
  return (
    <EcranCompte titre="Créer votre compte Synorix" sousTitre="Votre premier appel d’offres est offert."
      sousLeTitre={<VerificationHumaine />}
      sousCarte={(
        <p className="text-xs text-fg-2">
          En créant votre compte, vous acceptez les <Link to="/legal/cgu" className={LIEN}>conditions d’utilisation</Link> et
          la <Link to="/legal/politique-confidentialite" className={LIEN}>politique de confidentialité</Link>.
        </p>
      )}>
      <SignUp routing="path" path="/register" signInUrl="/login" />
    </EcranCompte>
  )
}
