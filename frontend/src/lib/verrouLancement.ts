/**
 * Un lancement à la fois (double clic) : un bouton ne se désactive qu'au rendu suivant, un second clic rapide relançait la
 * même action (deux dossiers téléchargés, test de bout en bout du 12/11). `prendre()` dit si l'on peut lancer ; `rendre()`
 * libère, une fois le lancement fini.
 */
export function verrouLancement(): { prendre: () => boolean; rendre: () => void } {
  let pris = false
  return {
    prendre: () => {
      if (pris) return false
      pris = true
      return true
    },
    rendre: () => { pris = false },
  }
}
