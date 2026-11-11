import { Message } from '@/components/ui/message'
import { Bouton } from '@/components/ui/bouton'

/**
 * ALIAS MINCE. Une action qui n'a pas abouti, dite calmement, avec de quoi réessayer : c'est le `Message` du système
 * (components/ui/message.tsx), ton « erreur » (rouge, son icône : un échec ne se confond pas avec un avertissement ambre —
 * jury, tour 1, export-telecharger-echec). À poser UNE fois, là où l'action a été lancée.
 */
export default function EchecAction({ message, onReessayer, onFermer }: {
  message: string
  /** Absent quand réessayer ne changerait rien (ex. passage introuvable). */
  onReessayer?: () => void
  onFermer?: () => void
  /** Ancien réglage de thème : sans effet, le message suit le thème. */
  calque?: boolean
}) {
  return (
    <Message ton="erreur" onFermer={onFermer} action={onReessayer ? <Bouton variante="secondaire" onClick={onReessayer}>Réessayer</Bouton> : undefined}>
      <span className="text-fg">{message}</span>
    </Message>
  )
}
