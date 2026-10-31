// Une seule vérité pour l'échéance, l'avancement et « en cours » (1.14) :
// tous les écrans passent par ces fonctions. Le calcul se fait à la minute
// près, heure limite comprise, en heure locale (celle de l'utilisateur).
// Avant : differenceInDays (tronque) ici, Math.ceil sur minuit UTC ailleurs —
// jusqu'à 48 h après la date limite, un écran pouvait dire « Aujourd'hui »
// ou « À déposer ».

export type EtatEcheance = 'sans_date' | 'a_venir' | 'proche' | 'aujourdhui' | 'passee'

export interface EcheanceSource {
  /** AAAA-MM-JJ (ou ISO). */
  date: string
  /** « 14h00 », « 14h », « 14:00 »… ; absente = fin de journée. */
  heure?: string | null
}

export interface Echeance {
  etat: EtatEcheance
  /** Jours calendaires jusqu'au jour limite (0 = aujourd'hui, négatif = passé). */
  jours: number | null
  libelle: string
  limite: Date | null
}

export const JOURS_PROCHE = 7

/** Moment limite en heure locale ; sans heure : 23:59:59 le jour dit. */
export function momentLimite(source: EcheanceSource | null | undefined): Date | null {
  if (!source?.date) return null
  const m = source.date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [an, mois, jour] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const h = (source.heure ?? '').match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i)
  if (h) return new Date(an, mois, jour, Number(h[1]), Number(h[2] ?? 0), 0)
  return new Date(an, mois, jour, 23, 59, 59)
}

const debutDuJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

function heureLibelle(limite: Date): string {
  return `${limite.getHours()}h${String(limite.getMinutes()).padStart(2, '0')}`
}

export function etatEcheance(source: EcheanceSource | null | undefined, maintenant: Date = new Date()): Echeance {
  const limite = momentLimite(source)
  if (!limite) return { etat: 'sans_date', jours: null, libelle: '—', limite: null }
  // Math.round absorbe le changement d'heure (23 h ou 25 h entre deux minuits).
  const jours = Math.round((debutDuJour(limite).getTime() - debutDuJour(maintenant).getTime()) / 86_400_000)
  if (maintenant.getTime() > limite.getTime()) {
    return { etat: 'passee', jours, libelle: 'Date de remise passée', limite }
  }
  if (jours === 0) {
    return { etat: 'aujourdhui', jours, libelle: source?.heure ? `Aujourd'hui, ${heureLibelle(limite)}` : "Aujourd'hui", limite }
  }
  return { etat: jours <= JOURS_PROCHE ? 'proche' : 'a_venir', jours, libelle: `J−${jours}`, limite }
}

interface ProjetEcheance {
  deadline?: string | null
  echeance?: EcheanceSource | null
  infos_marche?: { date_limite_reponse?: string | null } | null
}

/** L'échéance d'un AO : celle que le serveur consolide (date saisie ou RC, avec l'heure du RC). */
export function echeanceAO(p: ProjetEcheance): EcheanceSource | null {
  if (p.echeance?.date) return p.echeance
  if (p.deadline) return { date: p.deadline }
  const rc = p.infos_marche?.date_limite_reponse
  return rc ? { date: rc } : null
}

// ── « En cours » : la même définition partout (tableau de bord, Mes AO, barre latérale, serveur) ──
export const STATUTS_EN_COURS: readonly string[] = ['brouillon', 'en_cours', 'analyzed']
export const estEnCours = (statut: string) => STATUTS_EN_COURS.includes(statut)

// ── Avancement : en étapes, la même mesure partout ──
export const ETAPES_AO = ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Mémoire', 'Export'] as const

export function avancementAO(etapeCourante: number) {
  const etape = Math.min(Math.max(Math.round(etapeCourante) || 1, 1), ETAPES_AO.length)
  return {
    etape,
    total: ETAPES_AO.length,
    nom: ETAPES_AO[etape - 1],
    /** Part des étapes atteintes, pour remplir une jauge (1/6 → 6/6). */
    ratio: etape / ETAPES_AO.length,
    libelle: `Étape ${etape} sur ${ETAPES_AO.length} · ${ETAPES_AO[etape - 1]}`,
  }
}
