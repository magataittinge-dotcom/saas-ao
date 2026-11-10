// Mon entreprise — la phrase de Synorix, à côté du visage : ce qu'il sait de l'entreprise, et la prochaine information
// utile. Fonction pure, calculée depuis les données déjà chargées (aucun appel). Le décompte est celui des rubriques
// (lib/entreprise/avancement.ts : les informations indispensables que les dossiers demandent le plus souvent).
import { INFORMATIONS, RUBRIQUES, avancementTotal, type DonneesEntreprise, type RubriqueId } from './avancement'

export interface VoixSynorix {
  /** Ce que Synorix sait : « Synorix connaît 4 des 34 informations… ». */
  phrase: string
  /** La prochaine information utile (la première encore à renseigner, dans l'ordre des rubriques) ; null quand tout est là. */
  prochaine: { libelle: string; rubrique: RubriqueId; titreRubrique: string } | null
}

export function voixSynorix(d: DonneesEntreprise): VoixSynorix {
  const { rempli, total } = avancementTotal(d)
  const premiere = INFORMATIONS.find((i) => i.niveau === 'indispensable' && !i.rempli(d))
  const prochaine = premiere
    ? { libelle: premiere.libelle, rubrique: premiere.rubrique, titreRubrique: RUBRIQUES.find((r) => r.id === premiere.rubrique)?.titre ?? '' }
    : null
  if (!prochaine) {
    return { phrase: `Synorix connaît les ${total} informations que vos dossiers demandent le plus souvent. Chaque mémoire technique les reprend.`, prochaine }
  }
  if (rempli === 0) {
    return { phrase: 'Synorix ne sait encore rien de votre entreprise. Chaque information renseignée ici est reprise dans vos mémoires techniques.', prochaine }
  }
  const sait = rempli === 1
    ? `Synorix connaît 1 des ${total} informations que vos dossiers demandent le plus souvent.`
    : `Synorix connaît ${rempli} des ${total} informations que vos dossiers demandent le plus souvent.`
  return { phrase: sait, prochaine }
}
