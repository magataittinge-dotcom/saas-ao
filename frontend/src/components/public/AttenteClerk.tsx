import { ClerkFailed, ClerkLoading } from '@clerk/clerk-react'
import { EtatErreur } from '@/components/ui/etats'
import { Squelette } from '@/components/ui/squelette'

/**
 * Ce que la connexion et l'inscription montrent tant que la carte Clerk n'est pas là : la coquille du site est déjà
 * affichée (logo, fond, pied de page), un squelette aux dimensions de la carte tient sa place ; si le script de Clerk
 * n'arrive pas (réseau, bloqueur), on le dit et on propose de réessayer. Jamais une page blanche.
 */
export function AttenteClerk() {
  return (
    <>
      <ClerkLoading>
        <div role="status" aria-busy="true" className="w-full max-w-[400px]">
          <span className="sr-only">Chargement de l’écran de connexion</span>
          <Squelette className="h-[420px] w-full rounded-carte" />
        </div>
      </ClerkLoading>
      <ClerkFailed>
        <EtatErreur className="w-full max-w-[400px]" titre="L’écran de connexion n’a pas pu se charger"
          detail="Le service de connexion ne répond pas. Vérifiez votre réseau, puis réessayez."
          onReessayer={() => window.location.reload()} />
      </ClerkFailed>
    </>
  )
}
