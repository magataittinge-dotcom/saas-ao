"""baseline — schéma complet (source unique alembic)

Revision ID: 0001
Revises:
Create Date: 2026-04-30 00:00:00 (contenu régénéré 2026-07-13 — R14)

R14 — unification des migrations sur alembic. Cette baseline crée désormais
le schéma COMPLET (14 tables ORM), généré par autogenerate depuis les modèles
SQLAlchemy. Avant, elle était vide et le schéma naissait de
`Base.metadata.create_all()` + `_ensure_schema_columns()` (DDL runtime) : deux
sources de vérité qui pouvaient diverger. Désormais :

    alembic upgrade head            # base VIERGE → schéma complet (preuve R14)

Les révisions 0002→0022 restent en place, toutes idempotentes (gardes
`if not _has_column/_has_table`) : sur une base vierge elles sont des no-op
puisque cette baseline crée déjà toutes leurs colonnes/index. Sur une base
pré-existante déjà stampée à une révision intermédiaire, elles continuent de
s'appliquer normalement.

`rag_chunks` (corpus RAG pgvector) n'est PAS créé ici : c'est un objet DDL brut
géré par la révision 0003 (extension pgvector, type vector(N) non mappé ORM),
exclu de l'autogenerate via `include_object` dans env.py.
"""
from alembic import op
import sqlalchemy as sa


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('audit_logs',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=True),
    sa.Column('organization_id', sa.String(), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('target_type', sa.String(length=32), nullable=True),
    sa.Column('target_id', sa.String(), nullable=True),
    sa.Column('extra', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index('ix_audit_logs_org_created', 'audit_logs', ['organization_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_organization_id'), 'audit_logs', ['organization_id'], unique=False)
    op.create_index('ix_audit_logs_user_created', 'audit_logs', ['user_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    op.create_table('organizations',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('siret', sa.String(length=14), nullable=True),
    sa.Column('address', sa.Text(), nullable=True),
    sa.Column('logo_url', sa.String(length=500), nullable=True),
    sa.Column('presentation', sa.Text(), nullable=True),
    sa.Column('historique', sa.Text(), nullable=True),
    sa.Column('activites', sa.Text(), nullable=True),
    sa.Column('organigramme', sa.Text(), nullable=True),
    sa.Column('moyens_informatiques', sa.Text(), nullable=True),
    sa.Column('vehicules', sa.Text(), nullable=True),
    sa.Column('materiel', sa.Text(), nullable=True),
    sa.Column('fournisseurs', sa.Text(), nullable=True),
    sa.Column('plan', sa.Enum('free', 'pro', 'business', name='plan_type'), nullable=False),
    sa.Column('stripe_customer_id', sa.String(length=255), nullable=True),
    sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True),
    sa.Column('billing_provider', sa.String(length=32), server_default='stripe', nullable=False),
    sa.Column('billing_country', sa.String(length=2), server_default='FR', nullable=False),
    sa.Column('subscription_started_at', sa.DateTime(), nullable=True),
    sa.Column('siret_verified', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('trial_granted', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('naf_code', sa.String(length=10), nullable=True),
    sa.Column('effectif_tranche', sa.String(length=80), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('siret')
    )
    op.create_index(op.f('ix_organizations_billing_provider'), 'organizations', ['billing_provider'], unique=False)
    op.create_index(op.f('ix_organizations_stripe_customer_id'), 'organizations', ['stripe_customer_id'], unique=False)
    op.create_index(op.f('ix_organizations_stripe_subscription_id'), 'organizations', ['stripe_subscription_id'], unique=False)
    op.create_table('memoire_configs',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('nom_entreprise', sa.String(length=255), nullable=True),
    sa.Column('date_creation', sa.String(length=20), nullable=True),
    sa.Column('gerant_nom', sa.String(length=255), nullable=True),
    sa.Column('gerant_titre', sa.String(length=255), nullable=True),
    sa.Column('zone_intervention', sa.String(length=500), nullable=True),
    sa.Column('historique', sa.String(), nullable=True),
    sa.Column('activites', sa.String(), nullable=True),
    sa.Column('chiffre_affaires', sa.JSON(), nullable=True),
    sa.Column('organigramme_description', sa.String(), nullable=True),
    sa.Column('postes_cles', sa.JSON(), nullable=True),
    sa.Column('moyens_informatiques', sa.String(), nullable=True),
    sa.Column('vehicules', sa.String(), nullable=True),
    sa.Column('materiel', sa.String(), nullable=True),
    sa.Column('demarche_qualite', sa.String(), nullable=True),
    sa.Column('procedure_demarrage', sa.String(), nullable=True),
    sa.Column('gestion_securite', sa.String(), nullable=True),
    sa.Column('traitement_dechets', sa.String(), nullable=True),
    sa.Column('mesures_environnementales', sa.String(), nullable=True),
    sa.Column('fournisseurs_principaux', sa.String(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id')
    )
    op.create_table('documents',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('type', sa.String(length=64), nullable=False),
    sa.Column('file_url', sa.String(length=500), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('issued_date', sa.Date(), nullable=True),
    sa.Column('expiry_date', sa.Date(), nullable=True),
    sa.Column('status', sa.Enum('valid', 'expiring_soon', 'expired', 'unverified', 'unclassified', name='document_status'), nullable=False),
    sa.Column('category', sa.String(length=40), server_default='unclassified', nullable=False),
    sa.Column('uploaded_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint("type IN ('urssaf', 'kbis', 'fiscal', 'pro_btp', 'cibtp', 'declaration_honneur', 'pouvoir', 'rib', 'decennale', 'rc_civile', 'trc', 'dommages_ouvrage', 'qualibat', 'rge', 'caces', 'amiante_ss4', 'chiffre_affaires', 'effectifs', 'organigramme_doc', 'attestation_travaux', 'dume', 'autre')", name='documents_type_check'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_category'), 'documents', ['category'], unique=False)
    op.create_index(op.f('ix_documents_deleted_at'), 'documents', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_documents_expiry_date'), 'documents', ['expiry_date'], unique=False)
    op.create_index(op.f('ix_documents_organization_id'), 'documents', ['organization_id'], unique=False)
    op.create_index(op.f('ix_documents_type'), 'documents', ['type'], unique=False)
    op.create_table('memoire_templates',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('corps_metier', sa.String(length=255), nullable=False),
    sa.Column('content_json', sa.JSON(), nullable=False),
    sa.Column('is_default', sa.Boolean(), nullable=True),
    sa.Column('created_from_project_id', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('notifications',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('type', sa.String(length=40), nullable=False),
    sa.Column('titre', sa.String(length=255), nullable=False),
    sa.Column('corps', sa.Text(), nullable=True),
    sa.Column('read', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('dedup_key', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedup_key')
    )
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)
    op.create_index(op.f('ix_notifications_organization_id'), 'notifications', ['organization_id'], unique=False)
    op.create_index(op.f('ix_notifications_read'), 'notifications', ['read'], unique=False)
    op.create_table('projects',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=500), nullable=False),
    sa.Column('status', sa.Enum('brouillon', 'en_cours', 'analyzed', 'sans_suite', 'soumis', 'gagné', 'perdu', name='project_status'), nullable=False),
    sa.Column('deadline', sa.Date(), nullable=True),
    sa.Column('maitre_ouvrage', sa.String(length=255), nullable=True),
    sa.Column('current_step', sa.Integer(), nullable=True),
    sa.Column('completed_steps', sa.JSON(), nullable=True),
    sa.Column('criteres_jugement', sa.JSON(), nullable=True),
    sa.Column('infos_marche', sa.JSON(), nullable=True),
    sa.Column('lots_detectes', sa.JSON(), nullable=True),
    sa.Column('lots_announced', sa.Integer(), nullable=True),
    sa.Column('critical_fields', sa.JSON(), nullable=True),
    sa.Column('depose_at', sa.DateTime(), nullable=True),
    sa.Column('selected_lot', sa.String(length=50), nullable=True),
    sa.Column('selected_lot_name', sa.String(length=255), nullable=True),
    sa.Column('processing_status', sa.Text(), nullable=True),
    sa.Column('processing_progress', sa.Integer(), nullable=True),
    sa.Column('processing_detail', sa.Text(), nullable=True),
    sa.Column('active_run_consumptions', sa.Text(), nullable=True),
    sa.Column('dpgf_remplie_url', sa.String(length=500), nullable=True),
    sa.Column('dpgf_remplie_name', sa.String(length=255), nullable=True),
    sa.Column('dpgf_remplie_check', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_projects_deleted_at'), 'projects', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_projects_organization_id'), 'projects', ['organization_id'], unique=False)
    op.create_index(op.f('ix_projects_status'), 'projects', ['status'], unique=False)
    op.create_table('quota_consumptions',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('kind', sa.Enum('analysis', 'memoire', name='quota_kind'), nullable=False),
    sa.Column('project_id', sa.String(), nullable=True),
    sa.Column('lot', sa.String(length=50), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_quota_consumptions_created_at'), 'quota_consumptions', ['created_at'], unique=False)
    op.create_index(op.f('ix_quota_consumptions_organization_id'), 'quota_consumptions', ['organization_id'], unique=False)
    op.create_table('team_members',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=255), nullable=False),
    sa.Column('specialite', sa.String(length=255), nullable=True),
    sa.Column('experience_years', sa.Integer(), nullable=True),
    sa.Column('certifications', sa.String(length=500), nullable=True),
    sa.Column('cv_url', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_team_members_organization_id'), 'team_members', ['organization_id'], unique=False)
    op.create_table('users',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('clerk_id', sa.String(length=255), nullable=True),
    sa.Column('organization_id', sa.String(), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('phone', sa.String(length=50), nullable=True),
    sa.Column('role', sa.Enum('admin', 'member', name='user_role'), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_clerk_id'), 'users', ['clerk_id'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('compliance_items',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('project_id', sa.String(), nullable=False),
    sa.Column('exigence_text', sa.Text(), nullable=False),
    sa.Column('source_document', sa.Text(), nullable=True),
    sa.Column('source_page', sa.Integer(), nullable=True),
    sa.Column('source_excerpt', sa.Text(), nullable=True),
    sa.Column('lot', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('couvert', 'non_couvert', 'partiel', 'a_generer', 'expire', name='compliance_status'), nullable=False),
    sa.Column('category', sa.Enum('candidature', 'offre', 'technique', 'planning', 'criteres_notation', name='compliance_category'), nullable=False),
    sa.Column('priority', sa.Enum('obligatoire', 'souhaitée', name='compliance_priority'), nullable=False),
    sa.Column('suggestion_ia', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_compliance_items_lot'), 'compliance_items', ['lot'], unique=False)
    op.create_index(op.f('ix_compliance_items_project_id'), 'compliance_items', ['project_id'], unique=False)
    op.create_table('memoires_techniques',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('project_id', sa.String(), nullable=False),
    sa.Column('content_json', sa.JSON(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=True),
    sa.Column('generated_at', sa.DateTime(), nullable=True),
    sa.Column('variables', sa.JSON(), nullable=True),
    sa.Column('profile_overrides', sa.JSON(), nullable=True),
    sa.Column('is_reference_template', sa.Boolean(), nullable=True),
    sa.Column('docx_export_url', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('project_id')
    )
    op.create_table('project_documents',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('project_id', sa.String(), nullable=False),
    sa.Column('type', sa.String(length=64), nullable=False),
    sa.Column('file_url', sa.String(length=500), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('extracted_text', sa.Text(), nullable=True),
    sa.Column('extraction_warning', sa.String(length=300), nullable=True),
    sa.Column('file_size', sa.Integer(), nullable=True),
    sa.Column('page_count', sa.Integer(), nullable=True),
    sa.Column('pdf_preview_url', sa.String(length=500), nullable=True),
    sa.Column('related_lots', sa.JSON(), nullable=True),
    sa.Column('is_user_completed', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('vault_prompt_dismissed', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('uploaded_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint("type IN ('rc', 'cctp', 'ccap', 'plan', 'diagnostic', 'notice', 'dt', 'pgc_sps', 'planning', 'autre', 'dc1_template', 'dc2_template', 'acte_engagement_template', 'dpgf_template', 'bpu_template', 'dqe_template', 'cadre_reponse', 'attestation_visite_template')", name='project_documents_type_check'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_documents_project_id'), 'project_documents', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_documents_type'), 'project_documents', ['type'], unique=False)
    op.create_table('references',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('organization_id', sa.String(), nullable=False),
    sa.Column('intitule', sa.String(length=500), nullable=False),
    sa.Column('adresse', sa.String(length=500), nullable=True),
    sa.Column('maitre_ouvrage', sa.String(length=255), nullable=True),
    sa.Column('maitre_oeuvre', sa.String(length=255), nullable=True),
    sa.Column('lot', sa.String(length=255), nullable=True),
    sa.Column('montant_ht', sa.Float(), nullable=True),
    sa.Column('annee', sa.Integer(), nullable=True),
    sa.Column('statut', sa.Enum('gagné', 'perdu', 'en_cours', name='reference_status'), nullable=False),
    sa.Column('is_reference', sa.Boolean(), nullable=True),
    sa.Column('attestation_document_id', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['attestation_document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_references_deleted_at'), 'references', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_references_organization_id'), 'references', ['organization_id'], unique=False)
    op.create_table('checklist_items',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('project_id', sa.String(), nullable=False),
    sa.Column('document_type_required', sa.String(length=255), nullable=False),
    sa.Column('source_kind', sa.String(length=20), server_default='vault', nullable=False),
    sa.Column('linked_document_id', sa.String(), nullable=True),
    sa.Column('template_project_doc_id', sa.String(), nullable=True),
    sa.Column('completed_project_doc_id', sa.String(), nullable=True),
    sa.Column('status', sa.Enum('present', 'manquant', 'expire', 'expiration_proche', 'warning', 'non_applicable', name='checklist_status'), nullable=False),
    sa.Column('details', sa.Text(), nullable=True),
    sa.Column('source_in_rc', sa.String(length=500), nullable=True),
    sa.Column('signature_confirmed', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('rc_position', sa.Integer(), nullable=True),
    sa.Column('lot', sa.Text(), nullable=True),
    sa.Column('document_group', sa.String(length=20), server_default='fournir', nullable=False),
    sa.CheckConstraint("source_kind IN ('vault', 'dce_template')", name='checklist_items_source_kind_check'),
    sa.ForeignKeyConstraint(['completed_project_doc_id'], ['project_documents.id'], ),
    sa.ForeignKeyConstraint(['linked_document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.ForeignKeyConstraint(['template_project_doc_id'], ['project_documents.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_checklist_items_completed_project_doc_id'), 'checklist_items', ['completed_project_doc_id'], unique=False)
    op.create_index(op.f('ix_checklist_items_linked_document_id'), 'checklist_items', ['linked_document_id'], unique=False)
    op.create_index(op.f('ix_checklist_items_project_id'), 'checklist_items', ['project_id'], unique=False)
    op.create_index(op.f('ix_checklist_items_template_project_doc_id'), 'checklist_items', ['template_project_doc_id'], unique=False)


def downgrade() -> None:
    op.drop_table('memoire_configs')
    op.drop_index(op.f('ix_checklist_items_template_project_doc_id'), table_name='checklist_items')
    op.drop_index(op.f('ix_checklist_items_project_id'), table_name='checklist_items')
    op.drop_index(op.f('ix_checklist_items_linked_document_id'), table_name='checklist_items')
    op.drop_index(op.f('ix_checklist_items_completed_project_doc_id'), table_name='checklist_items')
    op.drop_table('checklist_items')
    op.drop_index(op.f('ix_references_organization_id'), table_name='references')
    op.drop_index(op.f('ix_references_deleted_at'), table_name='references')
    op.drop_table('references')
    op.drop_index(op.f('ix_project_documents_type'), table_name='project_documents')
    op.drop_index(op.f('ix_project_documents_project_id'), table_name='project_documents')
    op.drop_table('project_documents')
    op.drop_table('memoires_techniques')
    op.drop_index(op.f('ix_compliance_items_project_id'), table_name='compliance_items')
    op.drop_index(op.f('ix_compliance_items_lot'), table_name='compliance_items')
    op.drop_table('compliance_items')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_clerk_id'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_team_members_organization_id'), table_name='team_members')
    op.drop_table('team_members')
    op.drop_index(op.f('ix_quota_consumptions_organization_id'), table_name='quota_consumptions')
    op.drop_index(op.f('ix_quota_consumptions_created_at'), table_name='quota_consumptions')
    op.drop_table('quota_consumptions')
    op.drop_index(op.f('ix_projects_status'), table_name='projects')
    op.drop_index(op.f('ix_projects_organization_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_deleted_at'), table_name='projects')
    op.drop_table('projects')
    op.drop_index(op.f('ix_notifications_read'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_organization_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_table('notifications')
    op.drop_table('memoire_templates')
    op.drop_index(op.f('ix_documents_type'), table_name='documents')
    op.drop_index(op.f('ix_documents_organization_id'), table_name='documents')
    op.drop_index(op.f('ix_documents_expiry_date'), table_name='documents')
    op.drop_index(op.f('ix_documents_deleted_at'), table_name='documents')
    op.drop_index(op.f('ix_documents_category'), table_name='documents')
    op.drop_table('documents')
    op.drop_index(op.f('ix_organizations_stripe_subscription_id'), table_name='organizations')
    op.drop_index(op.f('ix_organizations_stripe_customer_id'), table_name='organizations')
    op.drop_index(op.f('ix_organizations_billing_provider'), table_name='organizations')
    op.drop_table('organizations')
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index('ix_audit_logs_user_created', table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_organization_id'), table_name='audit_logs')
    op.drop_index('ix_audit_logs_org_created', table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_table('audit_logs')
