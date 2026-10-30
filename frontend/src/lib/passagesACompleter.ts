// « N passages à compléter avant le dépôt » : le compte vient du détail d'export (memoire_info.passages_a_completer),
// calculé sur le texte du mémoire comme le Word le surligne. Formulation positive : jamais « manquant »,
// « incomplet » ni « absent ».

export function libellePassagesACompleter(n: number | null | undefined): string | null {
  if (!n || n < 1) return null
  return n === 1 ? '1 passage à compléter avant le dépôt' : `${n} passages à compléter avant le dépôt`
}
