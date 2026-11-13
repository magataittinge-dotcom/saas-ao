/**
 * Espaces insécables du français dans un texte venu du serveur : avant « : ; ? » et à l'intérieur des guillemets
 * « … ». Une ligne ne se coupe plus juste avant ses deux-points (« Fichier déposé / : X »).
 */
export function espacesFr(texte: string): string {
  return texte.replace(/ (?=[:;?»])/g, ' ').replace(/« /g, '« ')
}
