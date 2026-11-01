// Petite mention « Enregistré » : elle s'affiche une seconde après chaque enregistrement automatique réussi du bordereau.
// La région annoncée aux lecteurs d'écran (aria-live poli) et sa hauteur sont toujours là : la page ne saute pas quand le
// texte apparaît ou disparaît. En mouvement réduit, aucun fondu (règle dans index.css) : le texte est seulement affiché
// ou masqué. Un échec n'affiche rien : l'alerte d'échec de la page garde son message.
import { useEffect, useRef, useState } from 'react'

export const DUREE_MENTION_MS = 1000

export interface Mention {
  /** Affiche la mention pour une seconde pleine (un second enregistrement remet le délai à zéro). */
  montrer: () => void
  /** La retire tout de suite (enregistrement en échec). */
  masquer: () => void
  /** Arrête le minuteur sans rien changer à l'écran (démontage). */
  annuler: () => void
}

/** Minuteur de la mention, sans React : ``surChangement(true)`` à l'affichage, ``surChangement(false)`` une seconde après. */
export function creerMention(surChangement: (visible: boolean) => void, duree = DUREE_MENTION_MS): Mention {
  let minuteur: ReturnType<typeof setTimeout> | undefined
  const arreter = () => { if (minuteur !== undefined) { clearTimeout(minuteur); minuteur = undefined } }
  return {
    montrer() {
      arreter()
      surChangement(true)
      minuteur = setTimeout(() => { minuteur = undefined; surChangement(false) }, duree)
    },
    masquer() { arreter(); surChangement(false) },
    annuler: arreter,
  }
}

export function useMention(): Mention & { visible: boolean } {
  const [visible, setVisible] = useState(false)
  const reference = useRef<Mention | null>(null)
  if (reference.current === null) reference.current = creerMention(setVisible)
  const mention = reference.current
  useEffect(() => mention.annuler, [mention])
  return { visible, ...mention }
}

export default function MentionEnregistre({ visible }: { visible: boolean }) {
  return (
    <p className="min-h-4 text-xs leading-4 text-fg-2" aria-live="polite" data-mention-enregistre>
      {visible && <span className="mention-enregistre">Enregistré</span>}
    </p>
  )
}
