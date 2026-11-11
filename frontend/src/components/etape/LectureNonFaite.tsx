import { Link } from 'react-router-dom'
import { Bouton } from '@/components/ui/bouton'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { actionEtape } from '@/lib/intelligence/action'
import type { Project } from '@/types'
import { GabaritEtape } from './GabaritEtape'

/** « Parties, critères du règlement et longueur » : ce qui apparaîtra, dit en une énumération. */
export function enumerer(libelles: string[]): string {
  const mots = libelles.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1)))
  if (mots.length <= 1) return mots[0] ?? ''
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`
}

/**
 * L'état « analyse non faite », dessiné UNE fois pour toutes les étapes d'un AO (jury, tour 1 : des cases répétaient
 * « Analyse non faite », jusqu'à « Abonnement — Analyse non faite », à côté d'un bouton grisé qui redisait le titre).
 * Synorix le dit, en une phrase, avec le visage à côté ; une seule action, celle qui fait avancer l'AO (lib/etatAO : « Déposer
 * le dossier », « Analyser le dossier »…). Ni case, ni pastille, ni faux constat : rien n'est affiché comme su tant que rien
 * n'est analysé. À poser dans une étape à la place de son contenu : `<AnalyseNonFaite project={project} viendra={[…]} />`.
 */
export function AnalyseNonFaite({ project, viendra = [], className }: {
  project: Project
  /** Ce que l'écran montrera une fois l'analyse faite : « Parties », « Critères du règlement »… */
  viendra?: string[]
  className?: string
}) {
  const suite = actionEtape(project)
  const liste = enumerer(viendra)
  return (
    <div data-lecture-non-faite="" className={className}>
      <SynorixParle action={<Bouton asChild variante="principal"><Link to={`/projects/${project.id}/${suite.segment}`}>{suite.verbe}</Link></Bouton>}>
        Le dossier n’a pas encore été analysé. {liste ? `${liste} s’afficheront ici une fois l’analyse faite.` : 'Cet écran se remplit une fois l’analyse faite.'}
      </SynorixParle>
    </div>
  )
}

/**
 * Plan ou Rédiger d'un AO dont le dossier n'a pas été analysé : le titre de l'étape, sa ligne d'utilité, puis l'état
 * « analyse non faite » (G9 : pas de faux constat ; jury, tour 1 : ni bande de cases, ni bouton grisé).
 */
export default function LectureNonFaite({ project, titre, utilite, libelles }: {
  project: Project
  titre: string
  utilite: string
  /** Ancien réglage (le bouton grisé de l'en-tête) : sans effet. */
  action?: string
  /** Ce que l'écran montrera une fois l'analyse faite. */
  libelles: string[]
}) {
  return (
    <GabaritEtape titre={titre} utilite={utilite}>
      <AnalyseNonFaite project={project} viendra={libelles} />
    </GabaritEtape>
  )
}
