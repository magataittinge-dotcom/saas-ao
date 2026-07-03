import type { DocumentType, VaultCategory } from '@/types'

// Ordre d'affichage des sections du coffre-fort (« Non classés » traité à part, en tête).
export const VAULT_CATEGORY_ORDER: VaultCategory[] = [
  'attestations_sociales_fiscales',
  'documents_legaux',
  'assurances',
  'qualifications',
  'references_moyens',
  'autres',
]

export const VAULT_CATEGORY_LABELS: Record<VaultCategory, string> = {
  attestations_sociales_fiscales: 'Attestations sociales & fiscales',
  documents_legaux: 'Documents légaux',
  assurances: 'Assurances',
  qualifications: 'Qualifications',
  references_moyens: 'Références & moyens',
  autres: 'Autres',
  unclassified: 'Non classés',
}

// Types proposés par catégorie dans la modale de classement.
export const CATEGORY_TYPES: Record<Exclude<VaultCategory, 'unclassified'>, DocumentType[]> = {
  attestations_sociales_fiscales: ['urssaf', 'fiscal', 'pro_btp', 'cibtp'],
  documents_legaux: ['kbis', 'rib', 'pouvoir', 'declaration_honneur'],
  assurances: ['decennale', 'rc_civile'],
  qualifications: ['qualibat', 'caces', 'amiante_ss4'],
  references_moyens: ['chiffre_affaires', 'effectifs', 'organigramme_doc'],
  autres: ['autre'],
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  urssaf: 'Attestation URSSAF', kbis: 'KBIS', decennale: 'Décennale',
  rc_civile: 'RC Civile', qualibat: 'Qualibat RGE', pro_btp: 'PRO BTP',
  cibtp: 'CIBTP', fiscal: 'Attestation fiscale', dc1: 'DC1', dc2: 'DC2',
  rib: 'RIB', caces: 'CACES', amiante_ss4: 'Amiante SS4',
  declaration_honneur: "Déclaration sur l'honneur", pouvoir: 'Pouvoir habilité',
  organigramme_doc: 'Organigramme', chiffre_affaires: "Chiffre d'affaires",
  effectifs: 'Effectifs', autre: 'Autre',
}
