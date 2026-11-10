import { Champ, ChampDate, ZoneTexte } from '@/components/ui/champ'
import type { LigneEditable } from '@/lib/entreprise/liste'
import type { FamilleQualification, Qualification, Reference } from '@/types'
import { ChampNombre as ChampMontant } from '@/components/ui/champ'
import { CaseACocher } from '@/components/ui/case'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { cn } from '@/lib/utils'
import { AfficherPlus, BLOC_LISTE, BoutonAjout, BoutonRetirer, ChampNombre, Field } from './champs'

const CARTE = cn(BLOC_LISTE, 'grid gap-4')
/** « Aucun justificatif » : la liste déroulante du système n'a pas de valeur vide. */
const SANS = 'aucun'
const CIVILITES = new Set(['m', 'm.', 'mr', 'mme', 'mlle', 'mle', 'monsieur', 'madame', 'mademoiselle', 'dr', 'me', 'pr'])

/** Aperçu des initiales que le serveur écrira pour un particulier (même règle que `services/nom_client.py`). */
export function initialesClient(nom: string | undefined | null): string {
  return (nom ?? '').trim().split(/\s+/).filter(Boolean).map((mot) => (
    CIVILITES.has(mot.toLowerCase()) ? mot : mot.split('-').filter(Boolean).map((p) => p[0].toUpperCase() + '.').join('-')
  )).join(' ')
}
const GRILLE = 'grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]'

// ─── Qualifications, labels, certifications de management, assurances (table qualifications) ───

const MOTS: Record<FamilleQualification, { intitule: string; organisme: string; numero: string; perimetre: string; ajouter: string; exemple: string }> = {
  qualification: { intitule: 'Intitulé', organisme: 'Organisme', numero: 'Numéro de certificat', perimetre: 'Codes de qualification', ajouter: 'Ajouter une qualification', exemple: 'Qualibat 7112' },
  rge: { intitule: 'Label', organisme: 'Organisme', numero: 'Numéro', perimetre: 'Domaines couverts', ajouter: 'Ajouter un label', exemple: "Qualibat RGE, Qualit'EnR" },
  systeme_management: { intitule: 'Certification', organisme: 'Organisme certificateur', numero: 'Numéro', perimetre: 'Périmètre', ajouter: 'Ajouter une certification', exemple: 'ISO 9001, MASE' },
  assurance: { intitule: "Type d'assurance", organisme: 'Assureur', numero: 'Numéro de contrat', perimetre: 'Activités garanties', ajouter: 'Ajouter une assurance', exemple: 'Responsabilité civile' },
}
export const SUGGESTIONS_ASSURANCE = ['Responsabilité civile', 'Décennale', 'Tous risques chantier', 'Dommages-ouvrage']

export function EditeurQualifications({ famille, lignes, documents, modifier, ajouter, retirer }: {
  famille: FamilleQualification
  lignes: LigneEditable<Partial<Qualification>>[]
  documents: { id: string; file_name: string }[]
  modifier: (cle: string, c: Partial<Qualification>) => void
  ajouter: (v: Partial<Qualification>) => void
  retirer: (cle: string) => void
}) {
  const m = MOTS[famille]
  const siennes = lignes.filter((l) => l.valeurs.famille === famille)
  return (
    <div className="space-y-3">
      {siennes.map((l, i) => (
        <div key={l.cle} className={CARTE}>
          <div className={GRILLE}>
            <Field label={m.intitule}>
              <Champ aria-label={`${m.intitule} ${i + 1}`} list={famille === 'assurance' ? 'suggestions-assurance' : undefined} maxLength={200} placeholder={m.exemple}
                value={l.valeurs.intitule ?? ''} onChange={(e) => modifier(l.cle, { intitule: e.target.value })} />
            </Field>
            <Field label={m.organisme}><Champ aria-label={`${m.organisme} ${i + 1}`} maxLength={120} value={l.valeurs.organisme ?? ''} onChange={(e) => modifier(l.cle, { organisme: e.target.value })} /></Field>
            <Field label={m.numero}><Champ aria-label={`${m.numero} ${i + 1}`} maxLength={80} value={l.valeurs.numero ?? ''} onChange={(e) => modifier(l.cle, { numero: e.target.value })} /></Field>
            <Field label="Valable jusqu'au"><ChampDate aria-label={`Date de fin ${i + 1}`} valeur={l.valeurs.date_fin} onChange={(iso) => modifier(l.cle, { date_fin: iso })} /></Field>
          </div>
          <AfficherPlus libelle="Détails et justificatif">
            <Field label={m.perimetre}><ZoneTexte aria-label={`${m.perimetre} ${i + 1}`} rows={2} maxLength={500} value={l.valeurs.perimetre ?? ''} onChange={(e) => modifier(l.cle, { perimetre: e.target.value })} /></Field>
            <div className={GRILLE}>
              <Field label="Date d'obtention"><ChampDate aria-label={`Date d'obtention ${i + 1}`} valeur={l.valeurs.date_obtention} onChange={(iso) => modifier(l.cle, { date_obtention: iso })} /></Field>
              <Field label="Justificatif au coffre-fort">
                <ListeDeroulante libelle={`Justificatif ${i + 1}`} valeur={l.valeurs.document_id ?? SANS}
                  options={[{ valeur: SANS, libelle: 'À joindre' }, ...documents.map((d) => ({ valeur: d.id, libelle: d.file_name }))]}
                  onChange={(v) => modifier(l.cle, { document_id: v === SANS ? null : v })} />
              </Field>
            </div>
          </AfficherPlus>
          <BoutonRetirer libelle={`Retirer : ${m.intitule} ${i + 1}`} onClick={() => retirer(l.cle)} />
        </div>
      ))}
      {famille === 'assurance' && <datalist id="suggestions-assurance">{SUGGESTIONS_ASSURANCE.map((s) => <option key={s} value={s} />)}</datalist>}
      <BoutonAjout onClick={() => ajouter({ famille, intitule: '' })}>{m.ajouter}</BoutonAjout>
    </div>
  )
}

// ─── Références de chantiers (table references : POST / PATCH / DELETE /references) ───

export function EditeurReferences({ lignes, modifier, ajouter, retirer }: {
  lignes: LigneEditable<Partial<Reference>>[]
  modifier: (cle: string, c: Partial<Reference>) => void
  ajouter: () => void
  retirer: (cle: string) => void
}) {
  return (
    <div className="space-y-3">
      {lignes.map((l, i) => {
        const v = l.valeurs
        return (
          <div key={l.cle} className={CARTE}>
            <div className={GRILLE}>
              <Field label="Intitulé du chantier"><Champ aria-label={`Référence ${i + 1} : intitulé`} maxLength={500} value={v.intitule ?? ''} onChange={(e) => modifier(l.cle, { intitule: e.target.value })} /></Field>
              <Field label="Maître d'ouvrage"><Champ aria-label={`Référence ${i + 1} : maître d'ouvrage`} maxLength={255} value={v.maitre_ouvrage ?? ''} onChange={(e) => modifier(l.cle, { maitre_ouvrage: e.target.value })} /></Field>
              <Field label="Lieu du chantier"><Champ aria-label={`Référence ${i + 1} : lieu`} maxLength={500} value={v.adresse ?? ''} onChange={(e) => modifier(l.cle, { adresse: e.target.value })} /></Field>
              <Field label="Montant HT (€)">
                <ChampMontant min={0} unite="€" aria-label={`Référence ${i + 1} : montant HT`} valeur={v.montant_ht}
                  onChange={(n) => modifier(l.cle, { montant_ht: n ?? undefined })} />
              </Field>
              <Field label="Année de réalisation"><ChampNombre aria-label={`Référence ${i + 1} : année`} min={1950} max={2100} valeur={v.annee} onChange={(a) => modifier(l.cle, { annee: a ?? undefined })} /></Field>
              <Field label="Intervention">
                <ListeDeroulante libelle={`Référence ${i + 1} : intervention`} valeur={v.mode_intervention ?? undefined} placeholder="À préciser"
                  options={[{ valeur: 'direct', libelle: 'En direct' }, { valeur: 'sous_traitance', libelle: 'En sous-traitance' }, { valeur: 'cotraitance', libelle: 'En cotraitance' }]}
                  onChange={(m) => modifier(l.cle, { mode_intervention: m as Reference['mode_intervention'] })} />
              </Field>
            </div>
            <Field label="Nature des travaux réalisés"><ZoneTexte aria-label={`Référence ${i + 1} : nature des travaux`} rows={2} maxLength={1500} value={v.description ?? ''} onChange={(e) => modifier(l.cle, { description: e.target.value })} /></Field>
            <AfficherPlus libelle="Plus de détails">
              <div className={GRILLE}>
                <Field label="Maître d'œuvre"><Champ aria-label={`Référence ${i + 1} : maître d'œuvre`} maxLength={255} value={v.maitre_oeuvre ?? ''} onChange={(e) => modifier(l.cle, { maitre_oeuvre: e.target.value })} /></Field>
                <Field label="Lot ou corps d'état"><Champ aria-label={`Référence ${i + 1} : lot`} maxLength={255} value={v.lot ?? ''} onChange={(e) => modifier(l.cle, { lot: e.target.value })} /></Field>
                <Field label="Type de client">
                  <ListeDeroulante libelle={`Référence ${i + 1} : type de client`} valeur={v.client_type ?? undefined} placeholder="À préciser"
                    options={[{ valeur: 'public', libelle: 'Public' }, { valeur: 'prive_pro', libelle: 'Privé professionnel' }, { valeur: 'particulier', libelle: 'Particulier' }]}
                    onChange={(t) => modifier(l.cle, { client_type: t as Reference['client_type'] })} />
                </Field>
                <Field label="Adresse du client"><Champ aria-label={`Référence ${i + 1} : adresse du client`} maxLength={500} value={v.client_adresse ?? ''} onChange={(e) => modifier(l.cle, { client_adresse: e.target.value })} /></Field>
              </div>
            </AfficherPlus>
            {v.client_type === 'particulier' && (
              <div className="grid gap-1">
                <CaseACocher libelle="Afficher le nom complet du client sur les fiches et dans le mémoire"
                  coche={v.client_nom_complet === true} onChange={(coche) => modifier(l.cle, { client_nom_complet: coche })} />
                <p className="text-xs text-fg-3">Sans cette case, un particulier n'apparaît que par ses initiales ({initialesClient(v.maitre_ouvrage) || 'M. D.'}). Demandez-lui son accord avant de cocher.</p>
              </div>
            )}
            <BoutonRetirer libelle={`Retirer la référence ${i + 1}`} onClick={() => retirer(l.cle)} />
          </div>
        )
      })}
      <BoutonAjout onClick={ajouter}>Ajouter une référence</BoutonAjout>
    </div>
  )
}
