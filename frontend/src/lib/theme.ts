// Thème clair / nuit. L'attribut data-theme de <html> est posé AVANT l'affichage par
// public/theme-init.js (même clé, mêmes valeurs : un test le vérifie) ; ce module le lit,
// le change (bascule soleil / lune) et le mémorise dans ce navigateur.
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
export const CLE_THEME = 'synorix.theme'

const ecouteurs = new Set<() => void>()
const prevenir = () => ecouteurs.forEach((f) => f())

function systemeEnNuit(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
}

/** Choix mémorisé dans ce navigateur, ou null (le thème suit alors le système). */
export function themeMemorise(): Theme | null {
  try {
    const v = localStorage.getItem(CLE_THEME)
    return v === 'light' || v === 'dark' ? v : null
  } catch { return null }
}

/** Thème affiché maintenant. */
export function themeCourant(): Theme {
  if (typeof document !== 'undefined') {
    const v = document.documentElement.getAttribute('data-theme')
    if (v === 'light' || v === 'dark') return v
  }
  return themeMemorise() ?? (systemeEnNuit() ? 'dark' : 'light')
}

/** Applique le thème et, sauf demande contraire, le mémorise. */
export function appliquerTheme(theme: Theme, memoriser = true): void {
  document.documentElement.setAttribute('data-theme', theme)
  if (memoriser) { try { localStorage.setItem(CLE_THEME, theme) } catch { /* stockage indisponible : le choix vaut pour cette visite */ } }
  prevenir()
}

export function basculerTheme(): Theme {
  const suivant: Theme = themeCourant() === 'dark' ? 'light' : 'dark'
  appliquerTheme(suivant)
  return suivant
}

function abonner(rappel: () => void): () => void {
  ecouteurs.add(rappel)
  // sans choix mémorisé, un changement de préférence du système est suivi en direct
  let mq: MediaQueryList | null = null
  const suivreSysteme = () => { if (!themeMemorise()) appliquerTheme(systemeEnNuit() ? 'dark' : 'light', false) }
  try { mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', suivreSysteme) } catch { /* navigateur sans matchMedia */ }
  return () => { ecouteurs.delete(rappel); mq?.removeEventListener('change', suivreSysteme) }
}

/** [thème, bascule] pour les composants. */
export function useTheme(): [Theme, () => Theme] {
  const theme = useSyncExternalStore(abonner, themeCourant, () => 'light' as Theme)
  return [theme, basculerTheme]
}
