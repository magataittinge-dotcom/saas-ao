// ─── Auth & Users ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'member'

export interface User {
  id: string
  clerk_id?: string
  email: string
  name: string
  phone?: string
  role: UserRole
  organization_id: string
  created_at: string
}

// ─── Organization ─────────────────────────────────────────────────────────────

export type PlanType = 'pro' | 'business' | 'starter' | 'enterprise' | 'free'

export interface Organization {
  id: string
  name: string
  siret?: string
  address?: string
  logo_url?: string
  presentation?: string
  historique?: string
  activites?: string
  organigramme?: string
  moyens_informatiques?: string
  vehicules?: string
  materiel?: string
  fournisseurs?: string
  plan: PlanType
  stripe_customer_id?: string
  trial_granted?: boolean  // C15 — pilote l'écran « premier DCE offert »
  created_at: string
}

// ─── Documents (coffre-fort) ──────────────────────────────────────────────────

export type DocumentType =
  | 'urssaf'
  | 'kbis'
  | 'decennale'
  | 'rc_civile'
  | 'qualibat'
  | 'pro_btp'
  | 'cibtp'
  | 'fiscal'
  | 'dc1'
  | 'dc2'
  | 'rib'
  | 'caces'
  | 'amiante_ss4'
  | 'declaration_honneur'
  | 'pouvoir'
  | 'organigramme_doc'
  | 'chiffre_affaires'
  | 'effectifs'
  | 'autre'

// « valid » = document reconnu ET daté — jamais « fichier reçu ».
export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'unverified' | 'unclassified'

export type VaultCategory =
  | 'attestations_sociales_fiscales'
  | 'documents_legaux'
  | 'assurances'
  | 'qualifications'
  | 'references_moyens'
  | 'autres'
  | 'unclassified'

export interface Document {
  id: string
  organization_id: string
  type: DocumentType
  category: VaultCategory
  file_url: string
  file_name: string
  issued_date?: string
  expiry_date?: string
  status: DocumentStatus
  uploaded_at: string
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  organization_id: string
  name: string
  role: string
  specialite?: string
  experience_years?: number
  certifications?: string
  cv_url?: string
}

// ─── References ───────────────────────────────────────────────────────────────

export type ReferenceStatus = 'gagné' | 'perdu' | 'en_cours'

export interface Reference {
  id: string
  organization_id: string
  intitule: string
  adresse?: string
  maitre_ouvrage?: string
  maitre_oeuvre?: string
  lot?: string
  montant_ht?: number
  annee?: number
  statut: ReferenceStatus
  is_reference: boolean
  created_at: string
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export type ProjectStatus = 'brouillon' | 'en_cours' | 'analyzed' | 'sans_suite' | 'soumis' | 'gagné' | 'perdu'

export interface SousCritere {
  nom: string
  poids: number
}

export interface CritereJugement {
  nom: string
  poids: number
  sous_criteres: SousCritere[]
}

export interface ConditionsPaiement {
  delai_jours?: number
  avance_pct?: number | null
  acomptes?: string | null
}

export interface VisiteSite {
  obligatoire: boolean
  details?: string | null
}

export interface InfosMarche {
  objet?: string
  maitre_ouvrage?: string
  maitre_oeuvre?: string
  lots?: string[]
  date_limite_reponse?: string
  duree_marche?: string
  montant_estime?: string
  type_procedure?: string
  // Conditions financières
  conditions_paiement?: ConditionsPaiement | null
  penalites_retard?: string | null
  retenue_garantie_pct?: number | null
  caution_remplacante?: boolean | null
  validite_offres_jours?: number | null
  // Conditions d'exécution
  visite_site?: VisiteSite | null
  variantes_autorisees?: boolean | null
  conditions_sous_traitance?: string | null
  assurances_specifiques?: string[]
}

export interface LotOption {
  id: string             // "lot1", "lot1A", "lotA", etc.
  nom: string            // "Lot 1 — Gros œuvre" (auto-detected)
  user_label?: string    // user override saved via PATCH /lots/{id}/rename
  description_long?: string // CCTP excerpt (optional, set by lot_detector)
  confidence?: number    // 0–100 detection confidence (kept server-side; not displayed)
  sources?: string[]     // ["excel", "rc_text", "filename", "error"]
  tranches?: string[]    // ["Tranche ferme: Existant école", ...] (AMÉLIORATION 7)
}

export interface Project {
  id: string
  organization_id: string
  name: string
  status: ProjectStatus
  deadline?: string
  maitre_ouvrage?: string
  current_step: 1 | 2 | 3 | 4 | 5 | 6
  completed_steps?: Record<string, boolean>
  criteres_jugement?: CritereJugement[]
  infos_marche?: InfosMarche
  lots_detectes?: LotOption[]
  selected_lot?: string
  selected_lot_name?: string
  processing_status?: string
  processing_progress?: number
  processing_detail?: string
  created_at: string
  updated_at: string
}

// ─── Project Documents (DCE) ──────────────────────────────────────────────────

export type ProjectDocumentType = 'rc' | 'cctp' | 'ccap' | 'dpgf' | 'acte_engagement' | 'plan' | 'autre'

export interface ProjectDocument {
  id: string
  project_id: string
  type: ProjectDocumentType
  file_url: string
  file_name: string
  extracted_text?: string
  file_size?: number
  page_count?: number
  pdf_preview_url?: string
  related_lots?: string[] | null   // ["all"] | ["info"] | ["5"] | null (untagged)
  uploaded_at: string
}

// ─── Compliance Matrix ────────────────────────────────────────────────────────

export type ComplianceStatus = 'couvert' | 'non_couvert' | 'partiel' | 'a_generer' | 'expire'
export type ComplianceCategory = 'candidature' | 'offre' | 'technique' | 'planning' | 'criteres_notation'

export interface ComplianceItem {
  id: string
  project_id: string
  exigence_text: string
  source_document: string
  source_page?: number
  source_excerpt?: string
  status: ComplianceStatus
  category: ComplianceCategory
  priority: 'obligatoire' | 'souhaitée'
  suggestion_ia?: string
  created_at: string
}

// ─── Candidature Checklist ────────────────────────────────────────────────────

export type ChecklistStatus = 'present' | 'manquant' | 'expire' | 'expiration_proche' | 'warning' | 'non_applicable'
// C12 — confirmation de signature portée par ChecklistItem (voir plus bas)
export type ChecklistSourceKind = 'vault' | 'dce_template'

export interface ChecklistItem {
  id: string
  project_id: string
  document_type_required: string
  source_kind: ChecklistSourceKind
  linked_document_id?: string
  template_project_doc_id?: string
  completed_project_doc_id?: string
  status: ChecklistStatus
  details?: string
  source_in_rc?: string
  signature_confirmed?: boolean
  lot?: string | null
}

// ─── Mémoire Technique ────────────────────────────────────────────────────────

export interface MemoireContent {
  preambule: string
  partie_a: {
    implantation: string
    historique: string
    engagement_qualitatif: string
    activites: string
    organigramme: string
    roles_missions: string
    moyens_informatiques: string
    vehicules: string
    materiel: string
    references: string
    fournisseurs: string
  }
  partie_b: {
    demarrage: string
    interlocuteur: string
    qualite_ouvrages: string
    respect_planning: string
    securite: string
    dechets: string
    environnement: string
  }
  partie_c: {
    methodologie: string
    effectifs: string
    materiels: string
    hygiene_securite: string
    mesures_environnementales: string
    gpa: string
    delai: string
  }
}

export interface MemoireTechnique {
  id: string
  project_id: string
  content_json: MemoireContent
  version: number
  generated_at: string
  variables: {
    nb_ouvriers?: number
    delai?: string
    interlocuteur_id?: string
    particularites?: string
  }
  is_reference_template: boolean
  docx_export_url?: string
}

// ─── Memoire Template ─────────────────────────────────────────────────────────

export interface MemoireTemplate {
  id: string
  organization_id: string
  name: string
  corps_metier: string
  content_json: MemoireContent
  is_default: boolean
  created_from_project_id?: string
  created_at: string
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

// ─── Memoire Config ───────────────────────────────────────────────────────────

export interface CAEntry {
  annee: string
  montant: string
}

export interface PosteCle {
  poste: string
  nom: string
  role: string
}

export interface MemoireConfig {
  id: string
  organization_id: string
  nom_entreprise?: string
  date_creation?: string
  gerant_nom?: string
  gerant_titre?: string
  zone_intervention?: string
  historique?: string
  activites?: string
  chiffre_affaires?: CAEntry[]
  organigramme_description?: string
  postes_cles?: PosteCle[]
  moyens_informatiques?: string
  vehicules?: string
  materiel?: string
  demarche_qualite?: string
  procedure_demarrage?: string
  gestion_securite?: string
  traitement_dechets?: string
  mesures_environnementales?: string
  fournisseurs_principaux?: string
  updated_at?: string
  created_at?: string
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  projects_en_cours: number
  projects_soumis_ce_mois: number
  projects_gagnes: number
  taux_succes: number
  documents_expires: number
  documents_expirant_bientot: number
}
