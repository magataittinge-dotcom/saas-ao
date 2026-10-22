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
