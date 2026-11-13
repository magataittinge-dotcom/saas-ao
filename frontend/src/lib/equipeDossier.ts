// B3 — « Votre équipe face au dossier » (serveur : routers/equipe_dossier.py, GET /projects/:id/equipe). Les exigences du
// dossier qui citent une habilitation ou une qualification (SST, CACES, AIPR, habilitation électrique, amiante, travail
// en hauteur, Qualibat, RGE), en face de ce que le profil déclare. Un rapprochement de mots, sans règle juridique :
// l'écran dit « Dans votre profil » ou « À confirmer », jamais qu'une habilitation suffit ou non.
// Les sigles restent tels quels : le lexique (lib/lexique.ts) n'a pas encore de définition sourcée pour eux.
import { api } from '@/services/api'
import { libelleSource } from '@/lib/resumeAO'

export interface SourceEquipe {
  type: 'exigence'
  id: string
  document: string | null
  page: number | null
  /** Le passage du dossier qui cite l'habilitation. */
  extrait: string | null
}

export interface LigneEquipe {
  cle: string
  libelle: string
  sigle: string | null
  statut: 'dans_profil' | 'a_confirmer'
  /** « Dans votre profil » ou « À confirmer ». */
  etat: string
  /** Ce que le profil déclare (« 3 personnes déclarées (SST) », « Qualibat 2111 ») ; null : rien de déclaré. */
  profil: string | null
  /** « Le dossier cite R490 ; votre profil indique : CACES R482 B1. » */
  detail: string | null
  codes: string[]
  sources: SourceEquipe[]
  /** La rubrique de Mon entreprise où cela se déclare. */
  lien: string | null
}

export interface ReponseEquipe {
  lignes: LigneEquipe[]
  dans_profil: number
  a_confirmer: number
}

export function lectureEquipeDossier(id: string) {
  return {
    queryKey: ['equipe-dossier', id],
    queryFn: async (): Promise<ReponseEquipe> => (await api.get<ReponseEquipe>(`/projects/${id}/equipe`)).data,
  }
}

/** La phrase de tête : des faits, sans juger. */
export function phraseEquipe(r: Pick<ReponseEquipe, 'dans_profil' | 'a_confirmer'>): string {
  const total = r.dans_profil + r.a_confirmer
  const citees = `${total > 1 ? 'habilitations ou qualifications citées' : 'habilitation ou qualification citée'} par le dossier`
  if (r.a_confirmer === 0) return total > 1 ? `Les ${total} ${citees} sont dans votre profil.` : `L’${citees} est dans votre profil.`
  if (r.dans_profil === 0) return `${total} ${citees}, à confirmer dans votre profil.`
  return `${total} ${citees}\u00a0: ${r.dans_profil} dans votre profil, ${r.a_confirmer} à confirmer.`
}

/** « RC · page 19 » : la pièce et la page du passage. */
export function sourceEquipe(s: SourceEquipe): string | null {
  return libelleSource({ document: s.document ?? '', page: s.page })
}

/** Le geste de la ligne : la rubrique de Mon entreprise (jamais une adresse hors de l'application). */
export function gesteEquipe(l: Pick<LigneEquipe, 'statut' | 'lien'>): { libelle: string; vers: string } | null {
  if (!l.lien || !l.lien.startsWith('/company')) return null
  return { libelle: l.statut === 'dans_profil' ? 'Voir le profil' : 'Compléter le profil', vers: l.lien }
}
