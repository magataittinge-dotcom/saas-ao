import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/uiStore'
import './aurore.css'

// Le fond d'aurores (DESIGN.md § Components > Aurore) : la signature de Synorix, posée une fois dans Layout,
// derrière tout le contenu. Trois ellipses en radial-gradient (émeraude, turquoise, bleu), animées en transform
// seul (aucun filter: blur, aucun repaint par image), sous un masque qui les éteint à 78 % de la hauteur.
// Opacité : --aurore-opacite (0,30 le jour, elle se devine ; 0,9 la nuit).
//
// Quatre garde-fous l'arrêtent (image fixe) :
//   0. le réglage « Animer le fond » du menu du compte (stores/uiStore.ts), coupé par l'utilisateur ;
//   1. prefers-reduced-motion : « réduire les animations » (aussi coupé en CSS, sans attendre React) ;
//   2. visibilitychange : l'onglet est caché, rien ne tourne pour personne ;
//   3. navigator.connection : saveData ou réseau 2G (téléphone de chantier, connexion faible).

type Connexion = EventTarget & { saveData?: boolean; effectiveType?: string }

function connexion(): Connexion | undefined {
  return (navigator as Navigator & { connection?: Connexion }).connection
}

/** saveData demandé, ou réseau 2G (« slow-2g » ou « 2g ») : l'aurore reste une image fixe. */
export function connexionEconome(c: Pick<Connexion, 'saveData' | 'effectiveType'> | undefined): boolean {
  return !!c && (c.saveData === true || /2g$/.test(c.effectiveType ?? ''))
}

export default function Aurore() {
  const [arretee, setArretee] = useState(false)
  const animerFond = useUIStore((s) => s.animerFond)

  useEffect(() => {
    const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reseau = connexion()
    const mettreAJour = () => setArretee(document.hidden || mouvementReduit.matches || connexionEconome(reseau))
    mettreAJour()
    document.addEventListener('visibilitychange', mettreAJour)
    mouvementReduit.addEventListener('change', mettreAJour)
    reseau?.addEventListener?.('change', mettreAJour)
    return () => {
      document.removeEventListener('visibilitychange', mettreAJour)
      mouvementReduit.removeEventListener('change', mettreAJour)
      reseau?.removeEventListener?.('change', mettreAJour)
    }
  }, [])

  return (
    <div className="aurore" data-arretee={arretee || !animerFond ? '' : undefined} aria-hidden="true">
      <span className="aurore-ruban aurore-ruban-a" />
      <span className="aurore-ruban aurore-ruban-b" />
      <span className="aurore-ruban aurore-ruban-c" />
    </div>
  )
}
