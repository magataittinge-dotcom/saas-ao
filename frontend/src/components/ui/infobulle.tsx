import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/**
 * Infobulle : un mot d'explication au survol ET au focus clavier (un `title=` natif est invisible au toucher et au clavier).
 * Elle ne porte jamais une information nécessaire : ce qui compte est écrit dans la page. L'enfant est l'élément visé.
 */
export function Infobulle({ texte, children, cote = 'top' }: { texte: React.ReactNode; children: React.ReactElement; cote?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={cote}>{texte}</TooltipContent>
    </Tooltip>
  )
}
