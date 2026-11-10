import { SignUp } from '@clerk/clerk-react'
import CoquillePublique from '@/components/public/CoquillePublique'
import { AttenteClerk } from '@/components/public/AttenteClerk'

/**
 * Inscription : la carte Clerk habillée aux jetons (lib/clerkApparence.ts), dans la coquille du site. Le titre de la carte
 * est le `h1` de l'écran ; l'offre (« Votre premier appel d'offres est offert. ») est sa sous-ligne. Aucun slogan.
 */
export default function Register() {
  return (
    <CoquillePublique>
      <div className="grid justify-items-center pt-4 sm:pt-10">
        <AttenteClerk />
        <SignUp routing="path" path="/register" signInUrl="/login" />
      </div>
    </CoquillePublique>
  )
}
