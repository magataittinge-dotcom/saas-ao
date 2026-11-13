/**
 * Espaces insécables du français dans un texte venu du serveur : avant « : ; ? » et à l'intérieur des guillemets
 * « … ». Une ligne ne se coupe plus juste avant ses deux-points (« Fichier déposé / : X »). Un nombre et son signe ne se
 * séparent jamais (jury, tour 4, decider-tresorerie-detail : « 10 / % » à 390 px) : « 10 % », « 1 200 € ».
 */
export function espacesFr(texte: string): string {
  return texte.replace(/(\d) (?=[%€])/g, '$1\u00a0').replace(/ (?=[:;?»])/g, ' ').replace(/« /g, '« ')
}
