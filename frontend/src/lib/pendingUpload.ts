// C15 — passage des fichiers du DCE déposés à la création de l'AO vers StepUpload.
// Un File ne survit pas à la navigation via l'URL/sessionStorage : on le passe en mémoire, consommé une seule fois au
// montage de StepUpload. Plusieurs fichiers à la fois (testeur débutant, 11/11 : « il faut zipper soi-même ses PDF ») :
// le serveur reçoit déjà un envoi par fichier, l'écran de dépôt les enchaîne.
let pending: File[] = []

export function setPendingUpload(fichiers: File | readonly File[]) {
  pending = Array.isArray(fichiers) ? [...fichiers] : [fichiers as File]
}

export function takePendingUpload(): File[] {
  const f = pending
  pending = []
  return f
}
