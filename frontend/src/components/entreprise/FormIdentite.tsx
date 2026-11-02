import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sigle } from '@/components/common/Sigle'
import { Input, Textarea } from '@/components/ui/input'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { FORMES_JURIDIQUES, METIERS, lireDepartements } from '@/lib/entreprise/metiers'
import { AfficherPlus, ChampNombre, Field, Groupe, Pleine, SOURCE_SIRENE, Select } from './champs'
import CadreFormulaire from './CadreFormulaire'
import CarteSiege from './CarteSiege'
import { useFormulaireRubrique } from './useFormulaireRubrique'

const texte = (v: unknown): boolean => typeof v === 'string' && v.trim() !== ''

/**
 * Rubrique Identité : un seul formulaire, un seul « Enregistrer » (dans l'en-tête). L'organisation (nom, adresse,
 * coordonnées, forme juridique…) et le profil (dirigeant, activités…) s'écrivent chacun dans leur table, par leur route.
 * Trois groupes (coordonnées légales, dirigeant et contacts, activités et zone) ; les informations utiles et optionnelles
 * derrière « Afficher les informations utiles et en option ». Le chiffre d'affaires et l'effectif des derniers exercices
 * (demandés par le DC2) sont dans Certifications et références.
 */
export default function FormIdentite({ donnees, avant, idPanneau, idOnglet }: { donnees: DonneesEntreprise; avant?: ReactNode; idPanneau?: string; idOnglet?: string }) {
  const f = useFormulaireRubrique('identite', donnees)
  const { organisation: org, profil } = f.brouillon
  const [departements, setDepartements] = useState<string | null>(null)
  const adresse = typeof org.address === 'string' ? org.address : ''
  const metiers = profil.metiers ?? []
  const forme = org.forme_juridique ?? ''
  const sirene = donnees.organisation?.siret_verified ? SOURCE_SIRENE : undefined

  return (
    <CadreFormulaire
      rubrique="identite" titre="Identité" idPanneau={idPanneau} idOnglet={idOnglet}
      explication={<>Qui vous êtes : ce que l'acheteur lit en premier, et ce qui remplit la <Sigle code="DC1" /> et la <Sigle code="DC2" />.</>}
      etat={f} onEnregistrer={f.enregistrer} avant={avant}
    >
      <Groupe titre="Coordonnées légales" aide={sirene ? "Pré-remplies depuis le répertoire Sirene à l'inscription." : undefined}>
        <Field label="Nom de l'entreprise" rempli={texte(org.name)} source={sirene}>
          <Input value={org.name ?? ''} onChange={(e) => f.poserOrganisation('name', e.target.value)} required autoComplete="organization" />
        </Field>
        <Field label="SIRET" rempli={texte(donnees.organisation?.siret)} source={donnees.organisation?.siret_verified ? 'Vérifié au répertoire Sirene' : undefined}>
          <Input value={donnees.organisation?.siret ?? ''} readOnly inputMode="numeric" />
        </Field>
        <Field label="Forme juridique" rempli={texte(forme)} source={sirene}>
          <Select value={forme} onChange={(e) => f.poserOrganisation('forme_juridique', e.target.value)}>
            <option value="">À renseigner</option>
            {forme && !(FORMES_JURIDIQUES as readonly string[]).includes(forme) && <option value={forme}>{forme}</option>}
            {FORMES_JURIDIQUES.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="Adresse du siège" rempli={texte(adresse)} source={sirene}>
          <Input value={adresse} onChange={(e) => f.poserOrganisation('address', e.target.value)} autoComplete="street-address" />
        </Field>
        <CarteSiege adresse={donnees.organisation?.address} />
      </Groupe>

      <Groupe titre="Dirigeant et contacts">
        <Field label="Nom du dirigeant" rempli={texte(profil.gerant_nom)}>
          <Input value={profil.gerant_nom ?? ''} onChange={(e) => f.poserProfil('gerant_nom', e.target.value)} placeholder="Jean Dupont" />
        </Field>
        <Field label="Fonction du dirigeant" rempli={texte(profil.gerant_titre)}>
          <Input value={profil.gerant_titre ?? ''} onChange={(e) => f.poserProfil('gerant_titre', e.target.value)} placeholder="Gérant, PDG, directeur…" />
        </Field>
        <Field label="E-mail de l'entreprise" rempli={texte(org.email_contact)}>
          <Input type="email" value={org.email_contact ?? ''} onChange={(e) => f.poserOrganisation('email_contact', e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Téléphone" rempli={texte(org.telephone)}>
          <Input type="tel" value={org.telephone ?? ''} onChange={(e) => f.poserOrganisation('telephone', e.target.value)} autoComplete="tel" />
        </Field>
      </Groupe>

      <Groupe titre="Activités et zone">
        <Pleine>
          <Field label="Activités principales" rempli={texte(profil.activites)} aide="Les mots du mémoire technique">
            <Textarea rows={3} value={profil.activites ?? ''} onChange={(e) => f.poserProfil('activites', e.target.value)} placeholder="Maçonnerie, gros œuvre, rénovation…" />
          </Field>
        </Pleine>
        <Pleine>
          <Field label="Zone d'intervention géographique" rempli={texte(profil.zone_intervention)}>
            <Input value={profil.zone_intervention ?? ''} onChange={(e) => f.poserProfil('zone_intervention', e.target.value)} placeholder="Île-de-France, Provence-Alpes-Côte d'Azur…" />
          </Field>
        </Pleine>
      </Groupe>

      <AfficherPlus>
        <Groupe titre="Informations légales">
          <Field label="Date de création" rempli={texte(profil.date_creation)}>
            <Input value={profil.date_creation ?? ''} onChange={(e) => f.poserProfil('date_creation', e.target.value)} placeholder="2005" />
          </Field>
          <Field label="Ville du greffe (registre du commerce ou des métiers)" rempli={texte(org.greffe_rcs)}>
            <Input value={org.greffe_rcs ?? ''} onChange={(e) => f.poserOrganisation('greffe_rcs', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Capital social (€)" rempli={typeof org.capital_social === 'number'}>
            <ChampNombre valeur={typeof org.capital_social === 'number' ? org.capital_social : null} max={10_000_000_000} onChange={(v) => f.poserOrganisation('capital_social', v)} />
          </Field>
        </Groupe>
        <Groupe titre="Métiers, départements et présentation">
          <Pleine>
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
          </Pleine>
          <Field label="Départements d'intervention" rempli={(profil.departements_intervention ?? []).length > 0} aide="codes séparés par une virgule : 14, 50, 61">
            <Input
              value={departements ?? (profil.departements_intervention ?? []).join(', ')}
              onChange={(e) => { setDepartements(e.target.value); f.poserProfil('departements_intervention', lireDepartements(e.target.value)) }}
              onBlur={() => setDepartements(null)}
            />
          </Field>
          <Pleine>
            <Field label="Présentation en quelques lignes" rempli={texte(org.presentation)}>
              <Textarea rows={4} value={org.presentation ?? ''} onChange={(e) => f.poserOrganisation('presentation', e.target.value)} />
            </Field>
          </Pleine>
          <Pleine>
            <Field label="Historique et parcours" rempli={texte(profil.historique)}>
              <Textarea rows={4} value={profil.historique ?? ''} onChange={(e) => f.poserProfil('historique', e.target.value)} placeholder="Fondée en 2005, notre entreprise…" />
            </Field>
          </Pleine>
        </Groupe>
      </AfficherPlus>
    </CadreFormulaire>
  )
}
