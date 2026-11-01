import { Plus, Trash2 } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import type { LigneEditable } from '@/lib/entreprise/liste'
import type { FamilleQualification, Qualification, Reference } from '@/types'
import { AfficherPlus, BOUTON_AJOUT, BOUTON_RETIRER_TEXTE, ChampNombre, Field, Select } from './champs'

const CARTE = 'space-y-3 rounded-lg border border-bord bg-surface-0 p-3'
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
              <Input aria-label={`${m.intitule} ${i + 1}`} list={famille === 'assurance' ? 'suggestions-assurance' : undefined} maxLength={200} placeholder={m.exemple}
                value={l.valeurs.intitule ?? ''} onChange={(e) => modifier(l.cle, { intitule: e.target.value })} />
            </Field>
            <Field label={m.organisme}><Input aria-label={`${m.organisme} ${i + 1}`} maxLength={120} value={l.valeurs.organisme ?? ''} onChange={(e) => modifier(l.cle, { organisme: e.target.value })} /></Field>
            <Field label={m.numero}><Input aria-label={`${m.numero} ${i + 1}`} maxLength={80} value={l.valeurs.numero ?? ''} onChange={(e) => modifier(l.cle, { numero: e.target.value })} /></Field>
            <Field label="Valable jusqu'au"><Input type="date" aria-label={`Date de fin ${i + 1}`} value={l.valeurs.date_fin ?? ''} onChange={(e) => modifier(l.cle, { date_fin: e.target.value || null })} /></Field>
          </div>
          <AfficherPlus libelle="Détails et justificatif">
            <Field label={m.perimetre}><Textarea aria-label={`${m.perimetre} ${i + 1}`} rows={2} maxLength={500} value={l.valeurs.perimetre ?? ''} onChange={(e) => modifier(l.cle, { perimetre: e.target.value })} /></Field>
            <div className={GRILLE}>
              <Field label="Date d'obtention"><Input type="date" aria-label={`Date d'obtention ${i + 1}`} value={l.valeurs.date_obtention ?? ''} onChange={(e) => modifier(l.cle, { date_obtention: e.target.value || null })} /></Field>
              <Field label="Justificatif au coffre-fort">
                <Select aria-label={`Justificatif ${i + 1}`} value={l.valeurs.document_id ?? ''} onChange={(e) => modifier(l.cle, { document_id: e.target.value || null })}>
                  <option value="">À joindre</option>
                  {documents.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
                </Select>
              </Field>
            </div>
          </AfficherPlus>
          <button type="button" onClick={() => retirer(l.cle)} className={BOUTON_RETIRER_TEXTE} aria-label={`Retirer : ${m.intitule} ${i + 1}`}><Trash2 size={14} aria-hidden /> Retirer</button>
        </div>
      ))}
      {famille === 'assurance' && <datalist id="suggestions-assurance">{SUGGESTIONS_ASSURANCE.map((s) => <option key={s} value={s} />)}</datalist>}
      <button type="button" onClick={() => ajouter({ famille, intitule: '' })} className={BOUTON_AJOUT}><Plus size={13} aria-hidden /> {m.ajouter}</button>
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
              <Field label="Intitulé du chantier"><Input aria-label={`Référence ${i + 1} : intitulé`} maxLength={500} value={v.intitule ?? ''} onChange={(e) => modifier(l.cle, { intitule: e.target.value })} /></Field>
              <Field label="Maître d'ouvrage"><Input aria-label={`Référence ${i + 1} : maître d'ouvrage`} maxLength={255} value={v.maitre_ouvrage ?? ''} onChange={(e) => modifier(l.cle, { maitre_ouvrage: e.target.value })} /></Field>
              <Field label="Lieu du chantier"><Input aria-label={`Référence ${i + 1} : lieu`} maxLength={500} value={v.adresse ?? ''} onChange={(e) => modifier(l.cle, { adresse: e.target.value })} /></Field>
              <Field label="Montant HT (€)">
                <Input type="number" inputMode="decimal" min={0} step="any" aria-label={`Référence ${i + 1} : montant HT`} value={v.montant_ht ?? ''}
                  onChange={(e) => modifier(l.cle, { montant_ht: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
              <Field label="Année de réalisation"><ChampNombre aria-label={`Référence ${i + 1} : année`} min={1950} max={2100} valeur={v.annee} onChange={(a) => modifier(l.cle, { annee: a ?? undefined })} /></Field>
              <Field label="Intervention">
                <Select aria-label={`Référence ${i + 1} : intervention`} value={v.mode_intervention ?? ''} onChange={(e) => modifier(l.cle, { mode_intervention: (e.target.value || undefined) as Reference['mode_intervention'] })}>
                  {!v.mode_intervention && <option value="">À préciser</option>}
                  <option value="direct">En direct</option>
                  <option value="sous_traitance">En sous-traitance</option>
                  <option value="cotraitance">En cotraitance</option>
                </Select>
              </Field>
            </div>
            <Field label="Nature des travaux réalisés"><Textarea aria-label={`Référence ${i + 1} : nature des travaux`} rows={2} maxLength={1500} value={v.description ?? ''} onChange={(e) => modifier(l.cle, { description: e.target.value })} /></Field>
            <AfficherPlus libelle="Plus de détails">
              <div className={GRILLE}>
                <Field label="Maître d'œuvre"><Input aria-label={`Référence ${i + 1} : maître d'œuvre`} maxLength={255} value={v.maitre_oeuvre ?? ''} onChange={(e) => modifier(l.cle, { maitre_oeuvre: e.target.value })} /></Field>
                <Field label="Lot ou corps d'état"><Input aria-label={`Référence ${i + 1} : lot`} maxLength={255} value={v.lot ?? ''} onChange={(e) => modifier(l.cle, { lot: e.target.value })} /></Field>
                <Field label="Type de client">
                  <Select aria-label={`Référence ${i + 1} : type de client`} value={v.client_type ?? ''} onChange={(e) => modifier(l.cle, { client_type: (e.target.value || undefined) as Reference['client_type'] })}>
                    {!v.client_type && <option value="">À préciser</option>}
                    <option value="public">Public</option>
                    <option value="prive_pro">Privé professionnel</option>
                    <option value="particulier">Particulier</option>
                  </Select>
                </Field>
                <Field label="Adresse du client"><Input aria-label={`Référence ${i + 1} : adresse du client`} maxLength={500} value={v.client_adresse ?? ''} onChange={(e) => modifier(l.cle, { client_adresse: e.target.value })} /></Field>
              </div>
            </AfficherPlus>
            {v.client_type === 'particulier' && (
              <div className="space-y-1">
                <label className="flex min-h-9 items-center gap-2 text-sm text-fg [@media(pointer:coarse)]:min-h-11">
                  <input
                    type="checkbox" className="size-4 accent-[var(--accent-ui)]"
                    checked={v.client_nom_complet === true}
                    onChange={(e) => modifier(l.cle, { client_nom_complet: e.target.checked })}
                  />
                  Afficher le nom complet du client sur les fiches et dans le mémoire
                </label>
                <p className="text-xs text-fg-3">Sans cette case, un particulier n'apparaît que par ses initiales ({initialesClient(v.maitre_ouvrage) || 'M. D.'}). Demandez-lui son accord avant de cocher.</p>
              </div>
            )}
            <button type="button" onClick={() => retirer(l.cle)} className={BOUTON_RETIRER_TEXTE} aria-label={`Retirer la référence ${i + 1}`}><Trash2 size={14} aria-hidden /> Retirer</button>
          </div>
        )
      })}
      <button type="button" onClick={ajouter} className={BOUTON_AJOUT}><Plus size={13} aria-hidden /> Ajouter une référence</button>
    </div>
  )
}
