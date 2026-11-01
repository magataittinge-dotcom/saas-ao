import { useState } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { CA_VIDE } from '@/lib/entreprise/charges'
import { FORMES_JURIDIQUES, METIERS, lireDepartements } from '@/lib/entreprise/metiers'
import type { CAEntry } from '@/types'
import { AfficherPlus, BOUTON_AJOUT, BOUTON_RETRAIT, ChampNombre, Field, Groupe, PiedEnregistrer, Select } from './champs'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { cn } from '@/lib/utils'

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
const DEUX_COLONNES = 'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]'

function staticMapUrl(address: string): string {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=12&size=600x300&scale=2&maptype=roadmap&markers=color:red|${encodeURIComponent(address)}&key=${GMAPS_KEY}`
}

/**
 * Rubrique Identité : un seul formulaire, un seul « Enregistrer ». L'organisation (nom, adresse, coordonnées,
 * forme juridique…) et le profil (dirigeant, activités, chiffre d'affaires…) s'écrivent chacun dans leur table,
 * par leur route. Les informations indispensables d'abord ; utiles et optionnelles sous « Afficher plus ».
 */
export default function FormIdentite({ donnees }: { donnees: DonneesEntreprise }) {
  const f = useFormulaireRubrique('identite', donnees)
  const { organisation: org, profil } = f.brouillon
  const [erreurCarte, setErreurCarte] = useState(false)
  const [departements, setDepartements] = useState<string | null>(null)
  const adresse = typeof org.address === 'string' ? org.address : ''
  const ca: CAEntry[] = profil.chiffre_affaires?.length ? profil.chiffre_affaires : CA_VIDE()
  const poserCA = (lignes: CAEntry[]) => f.poserProfil('chiffre_affaires', lignes)
  const majCA = (i: number, changements: Partial<CAEntry>) => poserCA(ca.map((r, j) => (j === i ? { ...r, ...changements } : r)))
  const metiers = profil.metiers ?? []
  const forme = org.forme_juridique ?? ''

  return (
    <form onSubmit={(e) => { e.preventDefault(); f.enregistrer() }} className="space-y-6">
      <Groupe titre="Coordonnées légales" aide="Pré-remplies depuis le répertoire Sirene à l'inscription.">
        <Field label="Nom de l'entreprise">
          <Input value={org.name ?? ''} onChange={(e) => f.poserOrganisation('name', e.target.value)} required autoComplete="organization" />
        </Field>
        <div className={DEUX_COLONNES}>
          <Field label="SIRET" aide={donnees.organisation?.siret_verified ? 'Vérifié au répertoire Sirene' : undefined}>
            <Input value={donnees.organisation?.siret ?? ''} readOnly inputMode="numeric" />
          </Field>
          <Field label="Forme juridique">
            <Select value={forme} onChange={(e) => f.poserOrganisation('forme_juridique', e.target.value)}>
              <option value="">À renseigner</option>
              {forme && !(FORMES_JURIDIQUES as readonly string[]).includes(forme) && <option value={forme}>{forme}</option>}
              {FORMES_JURIDIQUES.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Adresse du siège">
          <Input value={adresse} onChange={(e) => f.poserOrganisation('address', e.target.value)} autoComplete="street-address" />
          {GMAPS_KEY && adresse.trim().length > 5 && !erreurCarte && (
            <div className="mt-3 overflow-hidden rounded-lg border border-bord-2">
              <img src={staticMapUrl(adresse)} alt="Aperçu carte" className="h-auto w-full" loading="lazy" onError={() => setErreurCarte(true)} />
              <div className="flex items-center gap-1.5 bg-surface-0 px-3 py-2 text-xs text-fg-3">
                <MapPin size={12} aria-hidden />
                Aperçu de la carte insérée dans vos mémoires techniques
              </div>
            </div>
          )}
        </Field>
        <div className={DEUX_COLONNES}>
          <Field label="E-mail de l'entreprise">
            <Input type="email" value={org.email_contact ?? ''} onChange={(e) => f.poserOrganisation('email_contact', e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Téléphone">
            <Input type="tel" value={org.telephone ?? ''} onChange={(e) => f.poserOrganisation('telephone', e.target.value)} autoComplete="tel" />
          </Field>
        </div>
        <div className={DEUX_COLONNES}>
          <Field label="Nom du dirigeant">
            <Input value={profil.gerant_nom ?? ''} onChange={(e) => f.poserProfil('gerant_nom', e.target.value)} placeholder="Jean Dupont" />
          </Field>
          <Field label="Fonction du dirigeant">
            <Input value={profil.gerant_titre ?? ''} onChange={(e) => f.poserProfil('gerant_titre', e.target.value)} placeholder="Gérant, PDG, directeur…" />
          </Field>
        </div>
      </Groupe>

      <Groupe titre="Activités et zone">
        <Field label="Activités principales">
          <Textarea rows={3} value={profil.activites ?? ''} onChange={(e) => f.poserProfil('activites', e.target.value)} placeholder="Maçonnerie, gros œuvre, rénovation…" />
        </Field>
        <Field label="Zone d'intervention géographique">
          <Input value={profil.zone_intervention ?? ''} onChange={(e) => f.poserProfil('zone_intervention', e.target.value)} placeholder="Île-de-France, Provence-Alpes-Côte d'Azur…" />
        </Field>
      </Groupe>

      <Groupe titre="Chiffre d'affaires et effectif" aide="Les derniers exercices clos : chiffre d'affaires hors taxes et effectif moyen annuel.">
        <div className="space-y-2">
          {ca.map((ligne, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label="Année" className="w-20 shrink-0" placeholder="Année" inputMode="numeric" maxLength={4} value={ligne.annee}
                onChange={(e) => majCA(i, { annee: e.target.value.replace(/\D/g, '') })} />
              <Input aria-label="Chiffre d'affaires hors taxes" placeholder="1 200 000 €" maxLength={40} value={ligne.montant}
                onChange={(e) => majCA(i, { montant: e.target.value })} />
              <ChampNombre aria-label="Effectif moyen annuel" placeholder="Effectif" max={999} className="w-24 shrink-0" valeur={ligne.effectif_moyen}
                onChange={(v) => majCA(i, { effectif_moyen: v })} />
              {ca.length > 1 && (
                <button type="button" onClick={() => poserCA(ca.filter((_, j) => j !== i))} aria-label="Retirer cette année" className={BOUTON_RETRAIT}>
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </div>
          ))}
          {ca.length < 5 && (
            <button type="button" onClick={() => poserCA([...ca, { annee: '', montant: '' }])} className={cn(BOUTON_AJOUT, 'mt-1')}>
              <Plus size={13} aria-hidden /> Ajouter une année
            </button>
          )}
        </div>
      </Groupe>

      <AfficherPlus>
        <div className={DEUX_COLONNES}>
          <Field label="Date de création">
            <Input value={profil.date_creation ?? ''} onChange={(e) => f.poserProfil('date_creation', e.target.value)} placeholder="2005" />
          </Field>
          <Field label="Ville du greffe (registre du commerce ou des métiers)">
            <Input value={org.greffe_rcs ?? ''} onChange={(e) => f.poserOrganisation('greffe_rcs', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Capital social (€)">
            <ChampNombre valeur={typeof org.capital_social === 'number' ? org.capital_social : null} max={10_000_000_000} onChange={(v) => f.poserOrganisation('capital_social', v)} />
          </Field>
        </div>
        <Field label="Présentation en quelques lignes">
          <Textarea rows={4} value={org.presentation ?? ''} onChange={(e) => f.poserOrganisation('presentation', e.target.value)} />
        </Field>
        <Field label="Historique et parcours">
          <Textarea rows={4} value={profil.historique ?? ''} onChange={(e) => f.poserProfil('historique', e.target.value)} placeholder="Fondée en 2005, notre entreprise…" />
        </Field>
        <Field label="Métiers exercés" groupe>
          <div className="grid gap-x-4 gap-y-1 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
            {METIERS.map((m) => (
              <label key={m.code} className="flex min-h-9 items-center gap-2 text-sm text-fg [@media(pointer:coarse)]:min-h-11">
                <input
                  type="checkbox" className="size-4 accent-[var(--accent-ui)]"
                  checked={metiers.includes(m.code)}
                  onChange={(e) => f.poserProfil('metiers', e.target.checked ? [...metiers, m.code] : metiers.filter((c) => c !== m.code))}
                />
                {m.libelle}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Départements d'intervention" aide="Codes séparés par une virgule : 14, 50, 61.">
          <Input
            value={departements ?? (profil.departements_intervention ?? []).join(', ')}
            onChange={(e) => { setDepartements(e.target.value); f.poserProfil('departements_intervention', lireDepartements(e.target.value)) }}
            onBlur={() => setDepartements(null)}
          />
        </Field>
        <Field label="Détail de chaque exercice" groupe aide="Chiffre d'affaires du domaine du marché et dates de l'exercice.">
          <div className="space-y-3">
            {ca.map((ligne, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-bord bg-surface-0 p-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
                <Field label={`Exercice ${ligne.annee || i + 1} : chiffre d'affaires du domaine`}>
                  <Input maxLength={40} value={ligne.montant_domaine ?? ''} onChange={(e) => majCA(i, { montant_domaine: e.target.value })} />
                </Field>
                <Field label="Début de l'exercice">
                  <Input type="date" value={ligne.exercice_debut ?? ''} onChange={(e) => majCA(i, { exercice_debut: e.target.value || null })} />
                </Field>
                <Field label="Fin de l'exercice">
                  <Input type="date" value={ligne.exercice_fin ?? ''} onChange={(e) => majCA(i, { exercice_fin: e.target.value || null })} />
                </Field>
              </div>
            ))}
          </div>
        </Field>
      </AfficherPlus>

      <PiedEnregistrer enCours={f.enCours} reussi={f.reussi} erreur={f.erreur} />
    </form>
  )
}
