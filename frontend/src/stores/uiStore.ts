import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Réglage « Animer le fond » (menu du compte) : l'aurore bouge. Coupé, elle reste une image fixe. */
  animerFond: boolean
  setAnimerFond: (v: boolean) => void
  /** Nombre d'actions principales (aplats d'accent) montées par l'écran : dès qu'il y en a une, « Nouvel appel d'offres »
   *  de la barre passe au trait (P1 : un seul aplat par écran). Tenu par <Bouton variante="principal">, jamais enregistré. */
  aplatsEcran: number
  /** Le bouton de suite de la barre du bas d'une étape, quand il est l'aplat de l'écran (compté à part : il cède sa place). */
  aplatsSuite: number
  declarerAplat: (delta: 1 | -1, suite?: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      animerFond: true,
      setAnimerFond: (animerFond) => set({ animerFond }),
      aplatsEcran: 0,
      aplatsSuite: 0,
      declarerAplat: (delta, suite = false) => set((s) => (suite
        ? { aplatsSuite: Math.max(0, s.aplatsSuite + delta) }
        : { aplatsEcran: Math.max(0, s.aplatsEcran + delta) })),
    }),
    { name: 'ui-prefs', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, animerFond: s.animerFond }) },
  ),
)
