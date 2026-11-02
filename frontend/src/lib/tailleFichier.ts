// Tailles de fichiers affichées : une seule unité (le Mo de 1 048 576 octets, celui de l'explorateur
// de fichiers) et la virgule décimale française.

const MO = 1024 * 1024

const virgule = (n: number) => n.toFixed(1).replace('.', ',')

export function tailleFichier(octets?: number): string {
  if (!octets) return ''
  if (octets < 1024) return `${octets} o`
  if (octets < MO) return `${(octets / 1024).toFixed(0)} Ko`
  return `${virgule(octets / MO)} Mo`
}

/** « 285,0 / 365,5 Mo (74 %) » pendant l'envoi ; `?` tant que le total n'est pas connu. */
export function progressionEnvoi(envoyes: number, total: number, pourcent: number): string {
  const sur = total > 0 ? virgule(total / MO) : '?'
  return `${virgule(envoyes / MO)} / ${sur} Mo (${pourcent} %)`
}
