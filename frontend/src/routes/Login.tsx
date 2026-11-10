import { SignIn } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'
import CoquillePublique from '@/components/public/CoquillePublique'
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
 * Connexion : la carte Clerk habillée aux jetons (lib/clerkApparence.ts, posée une fois sur le ClerkProvider), dans la
 * coquille du site : même fond, même aurore, même logo, clair ou nuit. Le titre de la carte est le `h1` de l'écran (serif).
 * Aucun slogan. Session expirée (F-01) : la phrase le dit, et la connexion ramène à la page d'où l'on vient.
 */
export default function Login() {
  const [params] = useSearchParams()
  const expiree = params.get('session') === 'expiree'
  const retour = lireRetour()
  return (
    <CoquillePublique>
      <div className="grid justify-items-center gap-5 pt-4 sm:pt-10">
        {expiree && <Message ton="attention" className="w-full max-w-[400px]">{PHRASE_SESSION_EXPIREE}</Message>}
        <SignIn routing="path" path="/login" signUpUrl="/register" forceRedirectUrl={retour} />
      </div>
    </CoquillePublique>
  )
}
