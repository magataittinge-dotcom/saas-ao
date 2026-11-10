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
  declarerAplat: (delta: 1 | -1) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      animerFond: true,
      setAnimerFond: (animerFond) => set({ animerFond }),
      aplatsEcran: 0,
      declarerAplat: (delta) => set((s) => ({ aplatsEcran: Math.max(0, s.aplatsEcran + delta) })),
    }),
    { name: 'ui-prefs', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, animerFond: s.animerFond }) },
  ),
)
