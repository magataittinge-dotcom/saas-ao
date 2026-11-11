import { useEffect, useState, type ReactNode } from 'react'
import CoquillePublique from './CoquillePublique'
import { AttenteClerk } from './AttenteClerk'
import { PARTAGE_DES_ROLES } from '@/components/onboarding/FilSeptEtapes'
import { Message } from '@/components/ui/message'
import { SynorixParle } from '@/components/ui/synorix-parle'

/** La case « Vérifiez que vous êtes humain » est-elle à l'écran ? Clerk la pose dans `#clerk-captcha`, replié (hauteur 0) tant
 *  que la vérification se fait seule ; il le déplie quand la personne doit cocher la case. */
export function verificationAffichee(zone: { childElementCount: number; style: { maxHeight: string } } | null): boolean {
  return zone !== null && zone.childElementCount > 0 && zone.style.maxHeight !== '0px'
}

/** Pendant la vérification anti-robot de l'inscription, la page dit ce qui se passe (essai du 10/11 : le formulaire laissait
 *  place à une case sans un mot, le testeur a cru l'inscription perdue). Rien d'autre ne bouge : coquille, titre, carte. */
export function VerificationHumaine() {
  const [affichee, setAffichee] = useState(false)
  useEffect(() => {
    const lire = () => setAffichee(verificationAffichee(document.getElementById('clerk-captcha')))
    lire()
    const veille = new MutationObserver(lire)
    veille.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
    return () => veille.disconnect()
  }, [])
  if (!affichee) return null
  return (
    <Message ton="info" titre="Vérification de sécurité" className="mt-6 max-w-[52ch]">
      Cochez la case « Vérifiez que vous êtes humain ». Votre inscription reprend ensuite, sans rien ressaisir.
    </Message>
  )
}

/**
 * L'écran d'un compte (connexion, inscription) : la coquille du site, le titre de la page à gauche sur le bord du logo (le
 * seul `h1`, en serif), sa sous-ligne, ce que Synorix dit ; à droite, la carte de Clerk habillée aux jetons, qui ne porte
 * plus que le formulaire. Le titre et la phrase sont à la page, pas au fournisseur : ils restent en place quand la carte
 * change (vérification anti-robot, code reçu). Au téléphone : titre, sous-ligne, carte.
 */
export default function EcranCompte({ titre, sousTitre, sousLeTitre, avantCarte, sousCarte, children }: {
  titre: string
  sousTitre: string
  /** Sous la sous-ligne : ce que la page dit pendant une étape (vérification en cours). */
  sousLeTitre?: ReactNode
  /** Au-dessus de la carte : un message (session expirée). */
  avantCarte?: ReactNode
  /** Sous la carte : une ligne (conditions acceptées). */
  sousCarte?: ReactNode
  children: ReactNode
}) {
  return (
    <CoquillePublique>
      <div className="grid items-start gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:pt-10">
        <div className="min-w-0">
          <h1 className="titre-page text-fg">{titre}</h1>
          <p className="mt-2 text-base text-fg-2">{sousTitre}</p>
          {sousLeTitre}
          <SynorixParle className="mt-10 max-lg:hidden">{PARTAGE_DES_ROLES}</SynorixParle>
        </div>
        <div className="grid w-full max-w-[400px] content-start gap-4">
          {avantCarte}
          <AttenteClerk />
          {children}
          {sousCarte}
        </div>
      </div>
    </CoquillePublique>
  )
}
