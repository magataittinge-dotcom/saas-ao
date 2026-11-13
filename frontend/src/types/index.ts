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

export type PlanType = 'essentiel' | 'pro' | 'business' | 'starter' | 'enterprise' | 'free'

export interface Organization {
  id: string
  name: string
  siret?: string
  siret_verified?: boolean
  naf_code?: string
  effectif_tranche?: string
  forme_juridique?: string
  capital_social?: number
  greffe_rcs?: string
  email_contact?: string
  telephone?: string
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
  experience_resume?: string
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
  description?: string
  client_type?: 'public' | 'prive_pro' | 'particulier'
  client_adresse?: string
  mode_intervention?: 'direct' | 'sous_traitance' | 'cotraitance'
  /** Migration 0031 : un particulier n'apparaît que par ses initiales sur les fiches et dans le mémoire, sauf si coché. */
  client_nom_complet?: boolean
  created_at: string
}

export type FamilleQualification = 'qualification' | 'rge' | 'systeme_management' | 'assurance'

export interface Qualification {
  id: string
  organization_id: string
  famille: FamilleQualification
  intitule: string
  organisme?: string | null
  numero?: string | null
  perimetre?: string | null
  date_obtention?: string | null
  date_fin?: string | null
  document_id?: string | null
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
  /** Questions à poser à l'acheteur (absent : pas encore préparées ; liste vide : rien à poser). */
  points_a_eclaircir?: PointAEclaircir[]
  /** L'avis de la veille d'où vient l'AO (conservé après l'analyse). */
  source_avis?: { id_boamp?: string | null; url_avis?: string | null; url_dossier?: string | null } | null
}

export interface PointAEclaircir {
  question: string
  pourquoi: string | null
  source_document: string | null
  source_page: number | null
  extrait: string | null
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

/** Ce que la liste « Mes AO » affiche en plus de l'étape (GET /projects ; null ailleurs ; chaque champ null = la donnée n'existe pas). */
export interface AvancementAO {
  unites: { analyses: number; memoires: number }
  pieces: { total: number; pretes: number } | null
  plan_valide_le: string | null
  memoire_ecrit_le: string | null
}

export interface Project {
  /** 1.14 — échéance unique (date saisie ou RC, avec l'heure du RC), calculée par le serveur. */
  echeance?: { date: string; heure: string | null } | null
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
  /** Les lots déjà analysés : l'écran Lots les rouvre sans les relire (« Ouvrir ce lot »). */
  lots_analyses?: string[]
  processing_status?: string
  processing_progress?: number
  processing_detail?: string
  created_at: string
  updated_at: string
  depose_at?: string | null
  avancement?: AvancementAO | null
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
  source_page?: number | null
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
  /** B7 — formulaire rempli déposé, à relire avant le dépôt (fait du serveur ; le motif est dans `details`). */
  a_relire?: boolean
  details?: string
  source_in_rc?: string
  signature_confirmed?: boolean
  /** « Je confirme avoir signé » demandé pour cette pièce (règle serveur :
   *  DC1, DC2, DUME, AE seulement si le RC l'exige ; déclaration sur l'honneur). */
  signature_required?: boolean
  /** « Jointe » : fait vérifié par le serveur sur le plan du ZIP (nom, date de fin). */
  jointe?: boolean
  piece_nom?: string | null
  valable_jusqu_au?: string | null
  /** « Déposé le … par … » : instant UTC (avec « Z ») et nom de l'auteur du geste. */
  depose_le?: string | null
  depose_par?: string | null
  /** Source de la lecture dans le RC : document, page, article (intitulé qui précède
   *  l'extrait) et exigence d'origine (pour « Voir dans le DCE »). */
  source_document?: string | null
  source_page?: number | null
  source_article?: string | null
  source_exigence_id?: string | null
  /** Lecture du RC (serveur) : pièce demandée à tous, « si concerné » ou facultative. */
  obligation?: 'obligatoire' | 'si_concerne' | 'facultatif'
  /** Lecture du RC (serveur) : remise au dépôt ou par l'attributaire. */
  phase?: 'depot' | 'attribution'
  lot?: string | null
  document_group?: 'fournir' | 'completer' | 'synorix' | 'workflow'
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
  /** E3 — parties que le patron a marquées « À refaire » (« partie_b.dechets » → 'a_refaire') ; absent = « Rédigée ».
   *  Clé technique tenue par le serveur : l'export ne la lit pas. */
  _etat_sections?: Record<string, 'a_refaire'>
  /** Plan suivi à la rédaction (titres du patron, ordre, parties ajoutées « ajout_<n> »). Posé par le serveur ; absent
   *  quand le mémoire a été rédigé sans plan validé. */
  _plan?: { parties: { partie: 'partie_a' | 'partie_b' | 'partie_c'; sous_cle: string; titre: string }[] }
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
  montant_domaine?: string | null
  exercice_debut?: string | null
  exercice_fin?: string | null
  effectif_moyen?: number | null
}

export type CategorieEffectif = 'encadrement' | 'chef_equipe' | 'ouvrier' | 'administratif' | 'apprenti'
export interface LigneEffectif { categorie: CategorieEffectif; specialite?: string | null; effectif: number }

export type TypeHabilitation = 'sst' | 'caces' | 'habilitation_electrique' | 'amiante_ss3' | 'amiante_ss4' | 'travail_hauteur' | 'autre'
export interface LigneHabilitation { type: TypeHabilitation; libelle?: string | null; nombre: number; valide_jusqu?: string | null }

/** Une ligne de matériel ou de véhicules. */
export interface LigneMoyen { quantite: number; designation: string; unite?: string | null; famille?: string | null }

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
  metiers?: string[]
  departements_intervention?: string[]
  effectifs_par_categorie?: LigneEffectif[]
  habilitations?: LigneHabilitation[]
  materiel_liste?: LigneMoyen[]
  vehicules_liste?: LigneMoyen[]
  sous_traitance_partenaires?: string
  sous_traitance_part_pct?: number
  sav_garantie?: string
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
