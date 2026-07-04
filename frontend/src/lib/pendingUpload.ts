// C15 — handoff du fichier DCE déposé sur l'écran d'accueil vers StepUpload.
// Un File ne survit pas à la navigation via l'URL/sessionStorage : on le
// passe en mémoire, consommé une seule fois au montage de StepUpload.
let pending: File | null = null

export function setPendingUpload(file: File) {
  pending = file
}

export function takePendingUpload(): File | null {
  const f = pending
  pending = null
  return f
}
