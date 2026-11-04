import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    libelle, valeur: 'Lecture non faite', detail: 'Apparaîtra une fois le dossier lu.',
  }))
  return (
    <GabaritEtape
      titre={titre}
      utilite={utilite}
      actionPrincipale={<Button type="button" variant="signature" disabled><Sparkles size={16} aria-hidden /> {action}</Button>}
      resume={<BandeResume libelle="Résumé de l'étape" cartes={cartes} />}
    >
      <div className="rounded-carte border border-bord-2 bg-surface-1 p-5 text-sm text-fg-2" data-lecture-non-faite="">
        <p>Le dossier n’a pas encore été lu. Cet écran se remplit une fois la lecture faite : il reprend alors ce que dit le règlement.</p>
        <Link
          to={`/projects/${project.id}/${suite.segment}`}
          className="mt-3 inline-flex min-h-10 items-center font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11"
        >
          {suite.verbe}
        </Link>
      </div>
    </GabaritEtape>
  )
}
