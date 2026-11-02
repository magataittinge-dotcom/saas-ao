// Le nom lisible d'une pièce de la checklist : jamais une clé brute (« dc1 », « acte_engagement_template », « attestation-visite »).
// Les sigles sont donnés sous leur forme développée, comme dans le lexique (lib/lexique.ts).
import { developper } from '@/lib/lexique'

const cle = (type: string) => type.trim().toLowerCase().replace(/_template$/, '').replace(/[\s_-]+/g, '_')

const NOMS: Record<string, string> = {
  dc1: 'Lettre de candidature (DC1)',
  dc2: 'Déclaration du candidat (DC2)',
  dc4: 'Déclaration de sous-traitance (DC4)',
  dume: 'Document unique de marché européen (DUME)',
  ae: 'Acte d’engagement (AE)',
  acte_engagement: 'Acte d’engagement (AE)',
  attestation_visite: 'Attestation de visite',
  declaration_honneur: 'Déclaration sur l’honneur',
  cadre_reponse: 'Cadre de réponse',
  dpgf: 'Tableau des prix (DPGF)',
  bpu: 'Prix unitaires (BPU)',
  dqe: 'Quantités estimées (DQE)',
  kbis: 'Extrait Kbis',
  urssaf: 'Attestation de vigilance (Urssaf)',
  fiscal: 'Attestation de régularité fiscale',
  pro_btp: 'Certificat Pro BTP',
  cibtp: 'Certificat CIBTP',
  decennale: 'Assurance décennale',
  rc_civile: 'Assurance de responsabilité civile',
  rc_pro: 'Assurance de responsabilité civile professionnelle',
  qualibat: 'Certification Qualibat',
  rib: 'Relevé d’identité bancaire',
  references: 'Références de chantiers',
  chiffre_affaires: 'Chiffre d’affaires',
  organigramme: 'Organigramme',
}

// Les formes développées viennent du lexique : un seul endroit où elles s'écrivent.
NOMS.dc1 = `${capitaliser(developper('DC1'))}`
NOMS.dc2 = capitaliser(developper('DC2'))
NOMS.dc4 = capitaliser(developper('DC4'))
NOMS.dume = capitaliser(developper('DUME'))
NOMS.ae = NOMS.acte_engagement = capitaliser(developper('AE'))

function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `details` : le libellé métier posé par le serveur quand il existe ; sinon le nom connu du type ; sinon le type, mis en forme. */
export function nomPiece(typeRequis: string, details?: string | null): string {
  const d = (details ?? '').trim()
  const connu = NOMS[cle(typeRequis)]
  if (d && !/^[a-z0-9_-]+$/i.test(d)) return d
  if (connu) return connu
  const brut = (d || typeRequis).trim().replace(/_template$/i, '').replace(/[_-]+/g, ' ')
  return capitaliser(brut)
}
