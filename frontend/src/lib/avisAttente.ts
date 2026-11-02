// Phrase sous la barre d'attente d'une analyse ou d'un mémoire. La promesse d'un
// e-mail n'est faite que si le serveur sait vraiment en envoyer (R11) ; tant que
// l'on ne le sait pas, on dit seulement ce qui est sûr.

export function avisAttente(tache: 'analyse' | 'mémoire', emailActif: boolean | undefined): string {
  if (emailActif === true) return 'Vous pouvez fermer cette page : Synorix vous prévient par e-mail.'
  return tache === 'analyse'
    ? "Vous pouvez quitter cette page, l'analyse continue."
    : 'Vous pouvez quitter cette page, la rédaction continue.'
}
