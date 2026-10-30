// « Synorix Intelligence » : le visage du Compagnon relié à six bulles, et la fiche « prochaine action ».
// Tout est calculé depuis les données que le tableau de bord reçoit déjà : aucun appel IA, aucun changement serveur.
//
//   <SynorixIntelligence projects={projects} stats={stats} prenom={firstName} />
import './intelligence.css'
import { useMemo, useRef, useState } from 'react'
import { calculerBulles, ficheAffichee, ORDRE_BULLES } from '@/lib/intelligence/bulles'
import type { DashboardStats, Project } from '@/types'
import Visage from './Visage'
import BullesAttention from './BullesAttention'
import ProchaineAction from './ProchaineAction'

export interface PropsSynorixIntelligence {
  projects: readonly Project[]
  stats?: DashboardStats | null
  /** Prénom pour la ligne d'accueil ; absent = pas de salutation. */
  prenom?: string
  /** Horloge injectable (tests, captures) ; par défaut, maintenant. */
  maintenant?: Date
  /** Niveau du titre (2 par défaut : le tableau de bord porte déjà son h1). */
  niveauTitre?: 1 | 2
  /** Accepte un WebGL rendu par le processeur : captures et mesures seulement. */
  accepterLogiciel?: boolean
  surMode?: (mode: 'poster' | 'webgl', raison: string | null) => void
}

const jourDuJour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export default function SynorixIntelligence({ projects, stats, prenom, maintenant, niveauTitre = 2, accepterLogiciel, surMode }: PropsSynorixIntelligence) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [choix, setChoix] = useState<string | null>(null)
  const bulles = useMemo(() => calculerBulles(projects, stats, maintenant ?? new Date()), [projects, stats, maintenant])
  const tons = useMemo(() => bulles.map((b) => b.ton), [bulles])
  const fiche = useMemo(() => ficheAffichee(choix, bulles, projects, maintenant ?? new Date()), [choix, bulles, projects, maintenant])
  const indexChoix = choix ? ORDRE_BULLES.indexOf(choix as (typeof ORDRE_BULLES)[number]) : -1
  const Titre = niveauTitre === 1 ? 'h1' : 'h2'

  return (
    <section className="syx" aria-labelledby="syx-titre" data-synorix-intelligence>
      <header className="syx-entete">
        <Titre className="syx-titre" id="syx-titre">Synorix Intelligence</Titre>
        <p className="syx-sous-titre">
          {prenom ? <strong>Bonjour {prenom}</strong> : null}{prenom ? ' · ' : ''}{jourDuJour(maintenant ?? new Date())}.
          {' '}Ce qui bouge dans vos appels d’offres, et ce qu’il faut faire maintenant.
        </p>
      </header>
      <div className="syx-zone" ref={zoneRef}>
        <Visage zoneRef={zoneRef} tons={tons} choix={indexChoix} accepterLogiciel={accepterLogiciel} surMode={surMode} />
        <BullesAttention bulles={bulles} choix={choix} onChoisir={setChoix} />
      </div>
      <ProchaineAction fiche={fiche} />
    </section>
  )
}
