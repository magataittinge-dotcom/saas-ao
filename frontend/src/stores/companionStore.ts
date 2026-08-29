import { create } from 'zustand'
import type { CompanionState } from '@/components/ui/CompanionOrb'

/**
 * État global du Compagnon IA (la tête dans le header).
 * Piloté par les écrans : analyse() au lancement d'une analyse DCE (SSE),
 * succeed() à la fin, idle() pour revenir au calme.
 * Les transitions visuelles (réveil / endormissement) sont gérées
 * par CompanionOrb lui-même — ici on ne pose que l'intention.
 */
interface CompanionStore {
  state: CompanionState
  setState: (state: CompanionState) => void
  /** Ouvre les yeux (upload DCE, interaction) */
  wake: () => void
  /** Analyse en cours — boucle neuronale */
  analyse: () => void
  /** Analyse terminée — vague ambre, puis retour au calme automatique */
  succeed: () => void
  /** Retour au calme */
  idle: () => void
  sleep: () => void
}

export const useCompanionStore = create<CompanionStore>()((set) => ({
  state: 'veille',
  setState: (state) => set({ state }),
  wake: () => set({ state: 'reveil' }),
  analyse: () => set({ state: 'analyse' }),
  succeed: () => set({ state: 'succes' }),
  idle: () => set({ state: 'veille' }),
  sleep: () => set({ state: 'sommeil' }),
}))

// Dev uniquement : tester les états depuis la console du navigateur
// → companion.analyse() / companion.succeed() / companion.idle()
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).companion = useCompanionStore.getState()
}
