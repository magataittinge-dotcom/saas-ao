// Structure du mémoire technique : les 25 sections rédigées, dans l'ordre du
// document (mêmes clés que backend/services/ai/memoire_generator.py).

export type PartieId = 'partie_a' | 'partie_b' | 'partie_c'

export interface SectionMemoire {
  part: PartieId
  cle: string
  titre: string
}

export const TITRES_PARTIES: Record<PartieId, string> = {
  partie_a: 'PARTIE A — PRÉSENTATION GÉNÉRALE',
  partie_b: 'PARTIE B — PRÉSENTATION DE LA PRESTATION',
  partie_c: 'PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE',
}

export const PARTIES: readonly PartieId[] = ['partie_a', 'partie_b', 'partie_c']

export const SECTIONS_MEMOIRE: readonly SectionMemoire[] = [
  { part: 'partie_a', cle: 'implantation', titre: '1. Implantation géographique' },
  { part: 'partie_a', cle: 'historique', titre: '2. Historique' },
  { part: 'partie_a', cle: 'engagement_qualitatif', titre: '3. Engagement qualitatif' },
  { part: 'partie_a', cle: 'activites', titre: '4. Nos activités' },
  { part: 'partie_a', cle: 'organigramme', titre: '5. Organigramme' },
  { part: 'partie_a', cle: 'roles_missions', titre: "6. Rôles et missions de l'équipe d'encadrement" },
  { part: 'partie_a', cle: 'moyens_informatiques', titre: '7. Moyens informatiques' },
  { part: 'partie_a', cle: 'vehicules', titre: '8. Véhicules' },
  { part: 'partie_a', cle: 'materiel', titre: '9. Matériel' },
  { part: 'partie_a', cle: 'references', titre: '10. Références chantiers' },
  { part: 'partie_a', cle: 'fournisseurs', titre: '11. Fournisseurs' },
  { part: 'partie_b', cle: 'demarrage', titre: '1. Démarrage du chantier' },
  { part: 'partie_b', cle: 'interlocuteur', titre: '2. Interlocuteur dédié' },
  { part: 'partie_b', cle: 'qualite_ouvrages', titre: '3. Qualité des ouvrages' },
  { part: 'partie_b', cle: 'respect_planning', titre: '4. Respect du planning' },
  { part: 'partie_b', cle: 'securite', titre: '5. Dispositions relatives à la sécurité' },
  { part: 'partie_b', cle: 'dechets', titre: '6. Traitement des déchets' },
  { part: 'partie_b', cle: 'environnement', titre: '7. Environnement' },
  { part: 'partie_c', cle: 'methodologie', titre: '1. Méthodologie détaillée' },
  { part: 'partie_c', cle: 'effectifs', titre: '2. Effectifs dédiés au chantier' },
  { part: 'partie_c', cle: 'materiels', titre: '3. Matériels dédiés' },
  { part: 'partie_c', cle: 'hygiene_securite', titre: '4. Hygiène et sécurité' },
  { part: 'partie_c', cle: 'mesures_environnementales', titre: '5. Mesures environnementales' },
  { part: 'partie_c', cle: 'gpa', titre: '6. Garantie de parfait achèvement (GPA)' },
  { part: 'partie_c', cle: 'delai', titre: '7. Délai de travaux' },
]

// ── Sommaire (1.9) : construit depuis les vrais titres du document ─────────────

/** Titres des parties tels qu'affichés dans le sommaire (la vue document les met en capitales). */
export const TITRES_PARTIES_SOMMAIRE: Record<PartieId, string> = {
  partie_a: 'Partie A — Présentation générale',
  partie_b: 'Partie B — Présentation de la prestation',
  partie_c: 'Partie C — Méthodologie mise en œuvre',
}

export const ID_PARTIE: Record<PartieId, string> = { partie_a: 'partie-a', partie_b: 'partie-b', partie_c: 'partie-c' }

/** Sections reprises en annexe de la vue document (même texte, identifiants propres). */
export const ANNEXES_MEMOIRE: readonly { cle: 'engagement_qualitatif' | 'references'; titre: string }[] = [
  { cle: 'engagement_qualitatif', titre: 'Certifications' },
  { cle: 'references', titre: 'Références similaires' },
]

export interface EntreeSommaire {
  id: string
  titre: string
  enfants: EntreeSommaire[]
}

type ContenuMemoire = { preambule?: string } & Partial<Record<PartieId, unknown>>

const redige = (c: ContenuMemoire, part: PartieId, cle: string) => {
  const v = (c[part] as Record<string, unknown> | undefined)?.[cle]
  return typeof v === 'string' && v.trim().length > 0
}

/** Le sommaire du mémoire : chaque entrée mène à la section de même nom (seules les sections rédigées). */
export function sommaireMemoire(contenu: ContenuMemoire): EntreeSommaire[] {
  const entrees: EntreeSommaire[] = [{ id: 'preambule', titre: 'Préambule', enfants: [] }]
  for (const p of PARTIES) {
    entrees.push({
      id: ID_PARTIE[p],
      titre: TITRES_PARTIES_SOMMAIRE[p],
      enfants: SECTIONS_MEMOIRE
        .filter((s) => s.part === p && redige(contenu, p, s.cle))
        .map((s) => ({ id: `sec-${s.cle}`, titre: s.titre, enfants: [] })),
    })
  }
  const annexes = ANNEXES_MEMOIRE
    .filter((a) => redige(contenu, 'partie_a', a.cle))
    .map((a) => ({ id: `annexe-${a.cle}`, titre: a.titre, enfants: [] }))
  if (annexes.length > 0) entrees.push({ id: 'annexes', titre: 'Annexes', enfants: annexes })
  return entrees
}
