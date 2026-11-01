import { createContext, useContext } from 'react'

/** Ce que le reste de la page peut demander au visage : jouer le clip « éclair » (un enregistrement réussi, par exemple). */
export interface ActionsVisage { eclair: () => void }

export const ContexteVisage = createContext<ActionsVisage>({ eclair: () => {} })

export const useVisage = (): ActionsVisage => useContext(ContexteVisage)
