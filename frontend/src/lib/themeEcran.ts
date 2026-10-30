// Thème effectif de l'écran affiché. Un écran pas encore refait reste en nuit (data-theme="dark" sur <main>,
// voir Layout.tsx). Les fenêtres (Dialog, Sheet), les infobulles et les notifications sont rendues en portail,
// hors de <main> : sans cette indication elles prennent le thème global choisi. Layout publie ici le thème
// forcé de l'écran ; chaque portail le lit et le pose sur son propre nœud. Le contexte React traverse les
// portails, la position dans le DOM n'a pas d'importance. Hors <main> (coquille : palette Ctrl K, barre
// d'icônes), aucune valeur : le thème global s'applique.
import { createContext, useContext } from 'react'

export type ThemeForce = 'dark' | undefined

const ThemeEcranContexte = createContext<ThemeForce>(undefined)

export const ThemeEcranProvider = ThemeEcranContexte.Provider

/** `'dark'` si l'écran courant est forcé en nuit, sinon `undefined` (thème global). À poser en `data-theme`. */
export const useThemeEcran = (): ThemeForce => useContext(ThemeEcranContexte)
