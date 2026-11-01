// Métiers exercés : les mêmes codes et libellés que la veille (backend/services/veille/metiers.py, LIBELLES).
export const METIERS: readonly { code: string; libelle: string }[] = [
  { code: 'gros_oeuvre', libelle: 'Gros œuvre et maçonnerie' },
  { code: 'cvc', libelle: 'Chauffage, ventilation, climatisation' },
  { code: 'cfo_cfa', libelle: 'Courants faibles' },
  { code: 'menuiseries', libelle: 'Menuiseries et vitrerie' },
  { code: 'facade_ite', libelle: 'Façade, ravalement et isolation extérieure' },
  { code: 'peinture', libelle: 'Peinture' },
  { code: 'plomberie', libelle: 'Plomberie et sanitaires' },
  { code: 'electricite', libelle: 'Électricité' },
  { code: 'couverture', libelle: 'Charpente, couverture et zinguerie' },
  { code: 'vrd', libelle: 'Voirie et réseaux divers' },
  { code: 'demolition', libelle: 'Démolition et désamiantage' },
  { code: 'etancheite', libelle: 'Étanchéité' },
  { code: 'carrelage', libelle: 'Carrelage et revêtements de sols et murs' },
  { code: 'platrerie', libelle: 'Plâtrerie, cloisons et plafonds' },
  { code: 'serrurerie', libelle: 'Serrurerie et métallerie' },
  { code: 'ascenseurs', libelle: 'Ascenseurs et élévateurs' },
  { code: 'espaces_verts', libelle: 'Espaces verts et aménagements paysagers' },
  { code: 'autre', libelle: 'Autre' },
]

export const FORMES_JURIDIQUES = ['SARL', 'EURL', 'SAS', 'SASU', 'SA', 'SCOP', 'Entreprise individuelle', 'Micro-entreprise', 'Autre'] as const

/** « 14, 50 2A » → ['14', '50', '2A'] : codes séparés par des virgules ou des espaces, sans doublon. */
export function lireDepartements(texte: string): string[] {
  const codes = texte.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
  return codes.filter((c, i) => codes.indexOf(c) === i)
}
