// Mes AO — la logique de l'écran, sans JSX : le fil réel à 7 étapes, le tri par remise, les comptes du résumé.
// Tout est déterministe (aucune IA) et lit les données de GET /projects. Les verbes viennent de `actionEtape()` (un seul calcul).
import { echeanceAO, estEnCours, etatEcheance, type Echeance } from '@/lib/echeance'
import { aMemoire } from '@/lib/intelligence/action'
import type { Project } from '@/types'

/** Les étapes d'un AO, dans l'ordre du fil affiché (identique à `STEPS` de components/project/StepProgress.tsx). */
export const FIL_ETAPES = ['Dépôt', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'] as const

type EtatAvancement = Pick<Project, 'current_step' | 'processing_status' | 'completed_steps'>

/**
 * Numéro de l'étape affichée (1 à 7) depuis l'étape tenue par le serveur (1 à 6) : « Plan » et « Rédiger » se rangent toutes deux
 * derrière l'étape 5 du serveur — « Rédiger » dès que la rédaction a commencé ou que le mémoire existe —, « Export » derrière la 6.
 */
export function etapeAffichee(p: EtatAvancement): number {
  const serveur = Math.min(Math.max(Math.round(p.current_step) || 1, 1), 6)
  if (serveur < 5) return serveur
  if (serveur === 6) return 7
  return p.processing_status === 'generating' || aMemoire(p) ? 6 : 5
}

/** « Étape 5 sur 7 · Plan » : la mesure du fil réel (le fil des étapes de l'AO en compte 7, pas 6). */
export function avancementAffiche(p: EtatAvancement) {
  const etape = etapeAffichee(p)
  return { etape, total: FIL_ETAPES.length, nom: FIL_ETAPES[etape - 1], libelle: `Étape ${etape} sur ${FIL_ETAPES.length} · ${FIL_ETAPES[etape - 1]}` }
}

export type EtatPoint = 'fait' | 'cours' | 'avenir'

/** Le fil d'un AO : les 7 étapes, chacune faite, en cours ou à venir. */
export function filDeLAO(p: EtatAvancement): { nom: string; etat: EtatPoint }[] {
  const etape = etapeAffichee(p)
  return FIL_ETAPES.map((nom, i) => ({ nom, etat: i + 1 < etape ? 'fait' : i + 1 === etape ? 'cours' : 'avenir' }))
}

const RANG: Record<Echeance['etat'], number> = { aujourdhui: 0, proche: 0, a_venir: 0, sans_date: 1, passee: 2 }

/**
 * Tri « Remise la plus proche » : les AO en cours d'abord (remise la plus proche, puis sans date, puis date passée), les AO terminés
 * ensuite — leurs dates passées ne les placent plus en tête. Départage stable : nom, puis identifiant.
 */
export function comparerParRemise(a: Project, b: Project, maintenant: Date = new Date()): number {
  const ea = etatEcheance(echeanceAO(a), maintenant)
  const eb = etatEcheance(echeanceAO(b), maintenant)
  return Number(!estEnCours(a.status)) - Number(!estEnCours(b.status))
    || RANG[ea.etat] - RANG[eb.etat]
    || (ea.limite?.getTime() ?? 0) - (eb.limite?.getTime() ?? 0)
    || a.name.localeCompare(b.name, 'fr')
    || a.id.localeCompare(b.id)
}
