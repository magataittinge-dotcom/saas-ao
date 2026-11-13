// B9 — contrôle des fichiers du dossier avant le dépôt (serveur : services/controle_fichiers_zip.py, sur le même plan que
// le ZIP). Des lignes « À relire », jamais bloquantes : passages « [À COMPLÉTER » restants, noms et chemins que certaines
// plateformes refusent, taille comparée à la limite du règlement quand il en donne une. Ici : les types et les mots.
import { api } from '@/services/api'
import { libelleSource } from '@/lib/resumeAO'

export type SourceControle =
  | { type: 'fichier'; fichier: string }
  | { type: 'memoire'; fichier: string }
  | { type: 'regle'; texte: string; url?: string | null }
  | { type: 'exigence'; id?: string; document: string; page: number | null }

export interface LigneControle {
  type: 'a_completer' | 'nom' | 'chemin' | 'taille'
  libelle: string
  /** Chemin du fichier dans le dossier ; null : la ligne parle du dossier entier (taille du pli). */
  fichier: string | null
  texte: string
  source: SourceControle | null
  nombre?: number
  pages?: number[]
  octets?: number
}

export interface ReponseControleFichiers {
  lignes: LigneControle[]
  nombre: number
  fichiers: number
  limite_taille: { octets: number; libelle: string; portee: 'fichier' | 'ensemble'; source: SourceControle | null } | null
}

/** La clé commence comme celle du détail de l'export : un dépôt qui rafraîchit l'écran relance aussi le contrôle. */
export function lectureControleFichiers(id: string) {
  return {
    queryKey: ['export-detail', id, 'controle-fichiers'],
    queryFn: async (): Promise<ReponseControleFichiers> => (await api.get<ReponseControleFichiers>(`/projects/${id}/export/controle-fichiers`)).data,
  }
}

/** « Memoire_technique.pdf » : le nom du fichier, sans le chemin du dossier. */
export function nomCourt(fichier: string | null | undefined): string | null {
  if (!fichier) return null
  return fichier.split('/').filter(Boolean).pop() ?? null
}

/** D'où vient la ligne : le fichier lui-même, la règle d'une plateforme (avec son lien), ou l'exigence du règlement. */
export function sourceControle(l: Pick<LigneControle, 'source'>): { libelle: string; url: string | null } | null {
  const s = l.source
  if (!s) return null
  if (s.type === 'memoire' || s.type === 'fichier') {
    return { libelle: s.type === 'memoire' ? 'votre mémoire technique, tel qu’il est rédigé' : 'le texte du fichier joint au dossier', url: null }
  }
  if (s.type === 'regle') return s.texte ? { libelle: s.texte, url: s.url && /^https:\/\//.test(s.url) ? s.url : null } : null
  const libelle = libelleSource({ document: s.document, page: s.page ?? null })
  return libelle ? { libelle, url: null } : null
}
