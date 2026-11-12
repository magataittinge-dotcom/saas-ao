import { SignIn } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'
import EcranCompte from '@/components/public/EcranCompte'
import { Message } from '@/components/ui/message'
import { PHRASE_SESSION_EXPIREE, retourApresConnexion } from '@/lib/sessionExpiree'

/** La page où revenir après une session expirée (F-01) ; rien si l'on vient d'ailleurs. */
function lireRetour(): string | undefined {
  try {
    return retourApresConnexion(window.sessionStorage) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Connexion : le titre de la page à gauche (le `h1`, en serif), la carte Clerk habillée aux jetons à droite
 * (lib/clerkApparence.ts, components/public/EcranCompte.tsx), dans la coquille du site, clair ou nuit.
 * Session expirée (F-01) : la phrase le dit, et la connexion ramène à la page d'où l'on vient.
 */
export default function Login() {
  const [params] = useSearchParams()
  const expiree = params.get('session') === 'expiree'
  const retour = lireRetour()
  return (
    <EcranCompte titre="Se connecter à Synorix" sousTitre="Retrouvez vos appels d’offres."
      avantCarte={expiree && <Message ton="attention">{PHRASE_SESSION_EXPIREE}</Message>}>
      <SignIn routing="path" path="/login" signUpUrl="/register" forceRedirectUrl={retour} />
    </EcranCompte>
  )
}
