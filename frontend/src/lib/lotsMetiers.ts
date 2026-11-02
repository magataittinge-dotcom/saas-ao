// « Dans vos métiers » : quels lots du dossier relèvent des métiers déclarés dans Mon entreprise — pur, sans réseau.
// Les codes sont ceux de la veille et de la rubrique Identité (lib/entreprise/metiers.ts). Un lot est reconnu par les mots de son
// intitulé ; un intitulé que l'on ne sait pas rattacher n'est jamais classé « dans vos métiers » par défaut.
import type { LotOption } from '@/types'

const MOTS_PAR_METIER: Record<string, RegExp> = {
  gros_oeuvre: /gros.?(?:œ|oe)uvre|ma[cç]onnerie|b[ée]ton|fondation|terrassement|structure/i,
  cvc: /chauffage|ventilation|climatisation|\bcvc\b|g[ée]nie climatique|thermique/i,
  cfo_cfa: /courants? faibles?|\bcfa\b|t[ée]l[ée]com|r[ée]seaux? informatiques?|s[ée]curit[ée] incendie/i,
  menuiseries: /menuiser|vitrerie|huisserie|fen[êe]tre|porte/i,
  facade_ite: /fa[cç]ade|ravalement|isolation (par l.)?ext[ée]rieure|\bite\b|bardage/i,
  peinture: /peinture|rev[êe]tements? muraux?|finitions?/i,
  plomberie: /plomberie|sanitaire/i,
  electricite: /[ée]lectricit[ée]|courants? forts?|\bcfo\b/i,
  couverture: /charpente|couverture|zinguerie|toiture/i,
  vrd: /\bvrd\b|voirie|r[ée]seaux divers|am[ée]nagements? ext[ée]rieurs?/i,
  demolition: /d[ée]molition|d[ée]samiantage|d[ée]construction|curage/i,
  etancheite: /[ée]tanch[ée]it[ée]/i,
  carrelage: /carrelage|rev[êe]tements? de sols?|sols? durs?|fa[ïi]ence/i,
  platrerie: /pl[âa]trerie|cloisons?|plafonds?|doublage/i,
  serrurerie: /serrurerie|m[ée]tallerie|garde-corps/i,
  ascenseurs: /ascenseur|[ée]l[ée]vateur/i,
  espaces_verts: /espaces? verts?|paysag|plantation/i,
}

/** Les métiers que l'intitulé d'un lot évoque (liste vide : intitulé non rattachable). */
export function metiersDuLot(intitule: string): string[] {
  return Object.entries(MOTS_PAR_METIER).filter(([, re]) => re.test(intitule)).map(([code]) => code)
}

/**
 * Sépare les lots entre « dans vos métiers » et les autres. Sans métier déclaré, ou si aucun lot ne correspond, tous les lots
 * restent ensemble (`dansVosMetiers` vide, `autres` = tout) : rien n'est replié sans raison.
 */
export function repartirLotsParMetiers<T extends Pick<LotOption, 'nom' | 'user_label'>>(lots: readonly T[], metiers: readonly string[] | null | undefined): { dansVosMetiers: T[]; autres: T[]; separes: boolean } {
  const miens = new Set(metiers ?? [])
  if (miens.size === 0) return { dansVosMetiers: [], autres: [...lots], separes: false }
  const dans = lots.filter((l) => metiersDuLot(l.user_label?.trim() || l.nom).some((m) => miens.has(m)))
  if (dans.length === 0 || dans.length === lots.length) return { dansVosMetiers: [], autres: [...lots], separes: false }
  return { dansVosMetiers: dans, autres: lots.filter((l) => !dans.includes(l)), separes: true }
}

/** « 1 unité », « 3 unités » : le coût d'un choix, jamais en euros. */
export const libelleUnites = (n: number) => `${n} ${n > 1 ? 'unités' : 'unité'}`
