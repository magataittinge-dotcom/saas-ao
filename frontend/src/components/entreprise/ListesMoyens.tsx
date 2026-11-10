import { Champ, ChampDate, ZoneTexte } from '@/components/ui/champ'
import type { CategorieEffectif, LigneEffectif, LigneHabilitation, LigneMoyen, TeamMember, TypeHabilitation } from '@/types'
import type { LigneEditable } from '@/lib/entreprise/liste'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { cn } from '@/lib/utils'
import { BLOC_LISTE, BoutonAjout, BoutonRetrait, ChampNombre, Field } from './champs'

const CARTE = cn(BLOC_LISTE, 'grid items-end gap-3 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]')

// ─── Personnes clés (table team_members : POST / PATCH / DELETE /users/team) ───

export function EditeurPersonnes({ lignes, modifier, ajouter, retirer }: {
  lignes: LigneEditable<Partial<TeamMember>>[]
  modifier: (cle: string, c: Partial<TeamMember>) => void
  ajouter: () => void
  retirer: (cle: string) => void
}) {
  return (
    <div className="space-y-3">
      {lignes.map((l, i) => (
        <div key={l.cle} className={CARTE}>
          <Field label="Nom"><Champ aria-label={`Personne clé ${i + 1} : nom`} maxLength={255} value={l.valeurs.name ?? ''} onChange={(e) => modifier(l.cle, { name: e.target.value })} /></Field>
          <Field label="Fonction"><Champ aria-label={`Personne clé ${i + 1} : fonction`} maxLength={255} value={l.valeurs.role ?? ''} onChange={(e) => modifier(l.cle, { role: e.target.value })} placeholder="Conducteur de travaux" /></Field>
          <Field label="Spécialité"><Champ aria-label={`Personne clé ${i + 1} : spécialité`} maxLength={255} value={l.valeurs.specialite ?? ''} onChange={(e) => modifier(l.cle, { specialite: e.target.value })} placeholder="Façades" /></Field>
          <Field label="Années d'expérience"><ChampNombre aria-label={`Personne clé ${i + 1} : années d'expérience`} max={80} valeur={l.valeurs.experience_years} onChange={(v) => modifier(l.cle, { experience_years: v ?? undefined })} /></Field>
          <Field label="Qualifications"><Champ aria-label={`Personne clé ${i + 1} : qualifications`} maxLength={500} value={l.valeurs.certifications ?? ''} onChange={(e) => modifier(l.cle, { certifications: e.target.value })} placeholder="SST, CACES R486…" /></Field>
          <div className="flex items-end gap-2 [grid-column:1/-1]">
            <div className="min-w-0 flex-1">
              <Field label="Résumé d'expérience">
                <ZoneTexte aria-label={`Personne clé ${i + 1} : résumé d'expérience`} rows={2} maxLength={1000} value={l.valeurs.experience_resume ?? ''} onChange={(e) => modifier(l.cle, { experience_resume: e.target.value })} />
              </Field>
            </div>
            <BoutonRetrait libelle={`Retirer la personne clé ${i + 1}`} onClick={() => retirer(l.cle)} />
          </div>
        </div>
      ))}
      <BoutonAjout onClick={ajouter}>Ajouter une personne clé</BoutonAjout>
    </div>
  )
}

// ─── Effectifs par catégorie (JSON effectifs_par_categorie : des nombres, jamais de nom) ───

type Effectifs = LigneEffectif[]
const partie = (e: Effectifs, c: CategorieEffectif) => e.filter((l) => l.categorie === c)
const sauf = (e: Effectifs, c: CategorieEffectif) => e.filter((l) => l.categorie !== c)

/** Une catégorie sans spécialité : un seul nombre (encadrement, administratif, apprentis). */
export function EffectifSimple({ valeur, categorie, libelle, onChange }: { valeur: Effectifs; categorie: CategorieEffectif; libelle: string; onChange: (e: Effectifs) => void }) {
  const ligne = partie(valeur, categorie)[0]
  return (
    <Field label={libelle} rempli={typeof ligne?.effectif === 'number'}>
      <ChampNombre max={999} valeur={ligne?.effectif} onChange={(v) => onChange(v === null ? sauf(valeur, categorie) : [...sauf(valeur, categorie), { categorie, specialite: null, effectif: v }])} />
    </Field>
  )
}

/** Une catégorie par spécialité (chefs d'équipe, ouvriers) : une ligne par spécialité. */
export function EffectifParSpecialite({ valeur, categorie, libelle, exemple, onChange }: { valeur: Effectifs; categorie: CategorieEffectif; libelle: string; exemple: string; onChange: (e: Effectifs) => void }) {
  const lignes = partie(valeur, categorie)
  const remplacer = (nouvelles: Effectifs) => onChange([...sauf(valeur, categorie), ...nouvelles])
  return (
    <Field label={libelle} groupe rempli={lignes.some((l) => typeof l.effectif === 'number')}>
      <div className="space-y-2">
        {lignes.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Champ aria-label={`${libelle} : spécialité ${i + 1}`} placeholder={exemple} maxLength={80} value={l.specialite ?? ''}
              onChange={(e) => remplacer(lignes.map((x, j) => (j === i ? { ...x, specialite: e.target.value } : x)))} />
            <ChampNombre aria-label={`${libelle} : effectif ${i + 1}`} placeholder="Effectif" max={999} className="w-24 shrink-0" valeur={l.effectif}
              onChange={(v) => remplacer(lignes.map((x, j) => (j === i ? { ...x, effectif: v ?? 0 } : x)))} />
            <BoutonRetrait libelle={`Retirer la ligne ${i + 1} de ${libelle}`} onClick={() => remplacer(lignes.filter((_, j) => j !== i))} />
          </div>
        ))}
        <BoutonAjout onClick={() => remplacer([...lignes, { categorie, specialite: '', effectif: 1 }])}>Ajouter une spécialité</BoutonAjout>
      </div>
    </Field>
  )
}

// ─── Habilitations (JSON habilitations : nombre par type, pas par personne) ───

type Habilitations = LigneHabilitation[]
const AUTRES: { type: TypeHabilitation; libelle: string }[] = [
  { type: 'caces', libelle: 'CACES' }, { type: 'habilitation_electrique', libelle: 'Habilitation électrique' },
  { type: 'amiante_ss3', libelle: 'Amiante sous-section 3' }, { type: 'amiante_ss4', libelle: 'Amiante sous-section 4' },
  { type: 'travail_hauteur', libelle: 'Travail en hauteur' }, { type: 'autre', libelle: 'Autre' },
]

export function HabilitationSst({ valeur, onChange }: { valeur: Habilitations; onChange: (h: Habilitations) => void }) {
  const ligne = valeur.find((h) => h.type === 'sst')
  return (
    <Field label="Secouristes du travail (SST) : nombre" rempli={typeof ligne?.nombre === 'number'}>
      <ChampNombre max={999} valeur={ligne?.nombre} onChange={(v) => onChange(v === null ? valeur.filter((h) => h.type !== 'sst') : [...valeur.filter((h) => h.type !== 'sst'), { type: 'sst', nombre: v, libelle: null, valide_jusqu: ligne?.valide_jusqu ?? null }])} />
    </Field>
  )
}

export function EditeurHabilitations({ valeur, onChange }: { valeur: Habilitations; onChange: (h: Habilitations) => void }) {
  const autres = valeur.filter((h) => h.type !== 'sst')
  const sst = valeur.filter((h) => h.type === 'sst')
  const remplacer = (n: Habilitations) => onChange([...sst, ...n])
  return (
    <Field label="Autres habilitations" groupe aide="Nombre de personnes habilitées par type, avec la date de fin si vous la connaissez. Aucun nom n'est demandé.">
      <div className="space-y-2">
        {autres.map((h, i) => (
          <div key={i} className={CARTE}>
            <Field label="Type">
              <ListeDeroulante libelle={`Habilitation ${i + 1} : type`} valeur={h.type} options={AUTRES.map((a) => ({ valeur: a.type, libelle: a.libelle }))}
                onChange={(v) => remplacer(autres.map((x, j) => (j === i ? { ...x, type: v as TypeHabilitation } : x)))} />
            </Field>
            {h.type === 'autre' && <Field label="Libellé"><Champ aria-label={`Habilitation ${i + 1} : libellé`} maxLength={80} value={h.libelle ?? ''} onChange={(e) => remplacer(autres.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))} /></Field>}
            <Field label="Nombre"><ChampNombre aria-label={`Habilitation ${i + 1} : nombre`} max={999} valeur={h.nombre} onChange={(v) => remplacer(autres.map((x, j) => (j === i ? { ...x, nombre: v ?? 0 } : x)))} /></Field>
            <Field label="Valable jusqu'au"><ChampDate aria-label={`Habilitation ${i + 1} : date de fin`} valeur={h.valide_jusqu} onChange={(iso) => remplacer(autres.map((x, j) => (j === i ? { ...x, valide_jusqu: iso } : x)))} /></Field>
            <BoutonRetrait libelle={`Retirer l'habilitation ${i + 1}`} onClick={() => remplacer(autres.filter((_, j) => j !== i))} />
          </div>
        ))}
        <BoutonAjout onClick={() => remplacer([...autres, { type: 'caces', nombre: 1, libelle: null, valide_jusqu: null }])}>Ajouter une habilitation</BoutonAjout>
      </div>
    </Field>
  )
}

// ─── Matériel et véhicules (JSON materiel_liste / vehicules_liste : quantité, désignation) ───

export function EditeurMoyens({ libelle, valeur, maximum, exemple, onChange }: { libelle: string; valeur: LigneMoyen[]; maximum: number; exemple: string; onChange: (l: LigneMoyen[]) => void }) {
  return (
    <Field label={libelle} groupe rempli={valeur.some((l) => l.designation.trim() !== '')}>
      <div className="space-y-2">
        {valeur.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <ChampNombre aria-label={`${libelle} ${i + 1} : quantité`} min={1} max={9999} placeholder="Qté" className="w-20 shrink-0" valeur={l.quantite}
              onChange={(v) => onChange(valeur.map((x, j) => (j === i ? { ...x, quantite: v ?? 1 } : x)))} />
            <Champ aria-label={`${libelle} ${i + 1} : désignation`} placeholder={exemple} maxLength={120} value={l.designation}
              onChange={(e) => onChange(valeur.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))} />
            <BoutonRetrait libelle={`Retirer la ligne ${i + 1} de ${libelle}`} onClick={() => onChange(valeur.filter((_, j) => j !== i))} />
          </div>
        ))}
        {valeur.length < maximum && (
          <BoutonAjout onClick={() => onChange([...valeur, { quantite: 1, designation: '' }])}>Ajouter une ligne</BoutonAjout>
        )}
      </div>
    </Field>
  )
}
