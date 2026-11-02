// Copier un texte dans le presse-papiers ; repli sur un champ caché quand l'API moderne est refusée (page non sécurisée, ancien navigateur).
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte)
      return true
    }
  } catch { /* repli ci-dessous */ }
  try {
    const champ = document.createElement('textarea')
    champ.value = texte
    champ.setAttribute('readonly', '')
    champ.style.position = 'fixed'
    champ.style.opacity = '0'
    document.body.appendChild(champ)
    champ.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(champ)
    return ok
  } catch {
    return false
  }
}
