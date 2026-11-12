import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bouton } from '@/components/ui/bouton'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { AnalyseNonFaite } from '@/components/etape'
import { actionEtape } from '@/lib/intelligence/action'
import type { Project } from '@/types'

/**
 * Lots, Décider ou Pièces d'un AO qui n'a pas encore d'analyse : UN état, le même sur les trois étapes (jury, tour 1 : trois
 * écrans du même AO neuf donnaient trois consignes, dont « Le dossier est bien enregistré… Relancer » sur un AO sans dossier).
 *  • l'AO en est au dépôt : `<AnalyseNonFaite>` du socle (Synorix le dit, le geste est celui de l'AO : déposer le dossier) ;
 *  • sinon (un dossier est là, l'analyse n'est pas lancée ; ou un cas que l'état de l'AO ne décrit pas) : la même forme, avec la
 *    phrase et le geste donnés par l'écran (`cas`).
 * Jamais « Relancer » quand rien n'a été lancé ; un seul bouton plein, celui qui fait avancer.
 */
export type CasSansAnalyse = 'sans-depot' | 'analyse-non-lancee'

const GESTES: Record<CasSansAnalyse, { segment: string; verbe: string }> = {
  'sans-depot': { segment: 'upload', verbe: 'Déposer le dossier de l’acheteur' },
  'analyse-non-lancee': { segment: 'lots', verbe: 'Choisir les lots à analyser' },
}

export function EtapeSansAnalyse({ project, cas, viendra, children }: {
  project: Project
  cas: CasSansAnalyse
  /** Ce que l'écran montrera une fois l'analyse faite : « La décision », « Les pièces à réunir »… */
  viendra: string[]
  /** La phrase de Synorix quand l'état de l'AO ne suffit pas à la dire. */
  children: ReactNode
}) {
  // L'état commun du socle dit déjà tout quand l'AO attend son dossier : même phrase, même bouton que Plan, Rédiger et Export.
  if (cas === 'sans-depot' && actionEtape(project).segment === GESTES[cas].segment) {
    return <AnalyseNonFaite project={project} viendra={viendra} />
  }
  const geste = GESTES[cas]
  return (
    <div data-etape-sans-analyse={cas}>
      <SynorixParle action={<Bouton asChild variante="principal"><Link to={`/projects/${project.id}/${geste.segment}`}>{geste.verbe}</Link></Bouton>}>
        {children}
      </SynorixParle>
    </div>
  )
}

export default EtapeSansAnalyse
