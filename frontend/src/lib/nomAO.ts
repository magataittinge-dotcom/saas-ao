// Nom d'un AO tiré du fichier déposé : l'extension et les séparateurs (_ et -) disparaissent.
// Le patron peut le renommer ensuite ; aucun formulaire avant le dépôt.
export const NOM_AO_PAR_DEFAUT = "Nouvel appel d'offres"

export function nomAODepuisFichier(nomFichier: string): string {
  const nom = nomFichier
    .replace(/\.(zip|pdf|docx|xlsx|xls)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return nom || NOM_AO_PAR_DEFAUT
}
