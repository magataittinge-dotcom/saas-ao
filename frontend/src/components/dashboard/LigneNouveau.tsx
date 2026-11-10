import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { BoutonIcone, classesBouton } from '@/components/ui/bouton'
import { Message } from '@/components/ui/message'
import { useAuthStore } from '@/stores/authStore'
import { fermerNouveaute, NOUVEAUTE, nouveauteFermee, nouveauteVisible } from '@/lib/bandeauNouveau'

/**
 * La ligne « Nouveau » de l'Accueil (défaut 7 du fondateur) : sous l'en-tête, une phrase, un lien, une croix. Elle n'existe
 * plus ailleurs : l'ancien bandeau pleine largeur a quitté la coquille. Congédiée, elle ne revient pas dans ce navigateur
 * (lib/bandeauNouveau.ts). C'est le message du système (`Message`), sans composant maison.
 */
export function LigneNouveau() {
  const organisation = useAuthStore((s) => s.organization)
  return <LigneNouveauSelonAge organisation={organisation} />
}

/** La ligne elle-même ; `organisation` à null tant qu'elle n'est pas chargée (rien n'est montré). */
export function LigneNouveauSelonAge({ organisation }: { organisation: { created_at?: string } | null }) {
  const [fermee, setFermee] = useState(nouveauteFermee)
  if (!nouveauteVisible(organisation, fermee)) return null
  const fermer = () => { setFermee(true); fermerNouveaute() }
  return (
    <div data-ligne-nouveau="" className="mb-6">
      <Message ton="info" titre="Nouveau" className="items-center"
        action={(
          <span className="flex items-center gap-1">
            <Link to={NOUVEAUTE.lien.to} className={classesBouton('lien')}>{NOUVEAUTE.lien.libelle}</Link>
            <BoutonIcone libelle="Fermer le bandeau" onClick={fermer} className="-my-1.5"><X aria-hidden strokeWidth={1.5} /></BoutonIcone>
          </span>
        )}>
        {NOUVEAUTE.texte}
      </Message>
    </div>
  )
}

export default LigneNouveau
