import { Link } from 'react-router-dom'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { actionEtape } from '@/lib/intelligence/action'
import type { Project } from '@/types'
import { BandeResume, type CarteResume } from './BandeResume'
import { GabaritEtape } from './GabaritEtape'

/**
 * Plan ou Rédiger d'un AO dont le dossier n'a pas été lu : pas de faux constat (« le règlement ne détaille pas de
 * sous-critères », « longueur non précisée »…), l'action principale grisée, et le chemin vers la lecture (G9).
 */
export default function LectureNonFaite({ project, titre, utilite, action, libelles }: {
  project: Project
  titre: string
  utilite: string
  /** L'action de l'écran, grisée : « Valider le plan », « Rédiger le mémoire ». */
  action: string
  /** Les cartes du résumé, toutes « Lecture non faite ». */
  libelles: string[]
}) {
  const suite = actionEtape(project)
  const cartes: CarteResume[] = libelles.map((libelle) => ({
    libelle, valeur: 'Analyse non faite', detail: 'Apparaîtra une fois le dossier analysé.',
  }))
  return (
    <GabaritEtape
      titre={titre}
      utilite={utilite}
      actionPrincipale={<Bouton variante="secondaire" disabled>{action}</Bouton>}
      resume={<BandeResume libelle="Résumé de l’étape" cartes={cartes} />}
    >
      <Carte className="text-sm text-fg-2" data-lecture-non-faite="">
        <p>Le dossier n’a pas encore été analysé. Cet écran se remplit une fois l’analyse faite : il reprend alors ce que dit le règlement.</p>
        <Bouton asChild variante="principal" className="mt-4"><Link to={`/projects/${project.id}/${suite.segment}`}>{suite.verbe}</Link></Bouton>
      </Carte>
    </GabaritEtape>
  )
}
