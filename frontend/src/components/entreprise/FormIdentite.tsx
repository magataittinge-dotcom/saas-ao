import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Sigle } from '@/components/common/Sigle'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import { CaseACocher } from '@/components/ui/case'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { FORMES_JURIDIQUES, METIERS, lireDepartements } from '@/lib/entreprise/metiers'
import { AfficherPlus, ChampNombre, Field, Groupe, Pleine, SOURCE_SIRENE } from './champs'
import CadreFormulaire from './CadreFormulaire'
import ChampSiret, { type ChampSiretHandle } from './ChampSiret'
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
  // Le SIRET a son propre contrôle (répertoire Sirene) : « Enregistrer » l'envoie aussi quand il a été tapé sans « Vérifier ».
  const siret = useRef<ChampSiretHandle>(null)
  const f = useFormulaireRubrique('identite', donnees, undefined, () => siret.current?.enregistrerSaisie() ?? Promise.resolve(null))
  const { organisation: org, profil } = f.brouillon
  const [departements, setDepartements] = useState<string | null>(null)
  const adresse = typeof org.address === 'string' ? org.address : ''
  const metiers = profil.metiers ?? []
  const forme = org.forme_juridique ?? ''
  const sirene = donnees.organisation?.siret_verified ? SOURCE_SIRENE : undefined

  return (
    <CadreFormulaire
      rubrique="identite" titre="Identité" idPanneau={idPanneau} idOnglet={idOnglet}
      explication={<>Qui vous êtes : ce que l’acheteur lit en premier, et ce qui remplit la <Sigle code="DC1" /> et la <Sigle code="DC2" />.</>}
      etat={f} onEnregistrer={f.enregistrer} avant={avant}
    >
      <Groupe titre="Coordonnées légales" aide={sirene ? "Pré-remplies depuis le répertoire Sirene à l’inscription." : undefined}>
        <Field label="Nom de l’entreprise" rempli={texte(org.name)} source={sirene}>
          <Champ value={org.name ?? ''} onChange={(e) => f.poserOrganisation('name', e.target.value)} autoComplete="organization" placeholder="Raison sociale" />
        </Field>
        <ChampSiret ref={siret} siret={donnees.organisation?.siret} verifie={donnees.organisation?.siret_verified} />
        <Field label="Forme juridique" rempli={texte(forme)} source={sirene}>
          <ListeDeroulante valeur={forme || undefined} onChange={(v) => f.poserOrganisation('forme_juridique', v)}
            options={[...(forme && !(FORMES_JURIDIQUES as readonly string[]).includes(forme) ? [forme] : []), ...FORMES_JURIDIQUES].map((x) => ({ valeur: x, libelle: x }))} />
        </Field>
        <Field label="Adresse du siège" rempli={texte(adresse)} source={sirene}>
          <Champ value={adresse} onChange={(e) => f.poserOrganisation('address', e.target.value)} autoComplete="street-address" placeholder="Numéro, rue, code postal, ville" />
        </Field>
        <CarteSiege adresse={donnees.organisation?.address} />
      </Groupe>

      <Groupe titre="Dirigeant et contacts">
        <Field label="Nom du dirigeant" rempli={texte(profil.gerant_nom)}>
          <Champ value={profil.gerant_nom ?? ''} onChange={(e) => f.poserProfil('gerant_nom', e.target.value)} placeholder="Prénom et nom" />
        </Field>
        <Field label="Fonction du dirigeant" rempli={texte(profil.gerant_titre)}>
          <Champ value={profil.gerant_titre ?? ''} onChange={(e) => f.poserProfil('gerant_titre', e.target.value)} placeholder="Gérant, PDG, directeur…" />
        </Field>
        <Field label="E-mail de l’entreprise" rempli={texte(org.email_contact)}>
          <Champ type="email" value={org.email_contact ?? ''} onChange={(e) => f.poserOrganisation('email_contact', e.target.value)} autoComplete="email" placeholder="contact@entreprise.fr" />
        </Field>
        <Field label="Téléphone" rempli={texte(org.telephone)}>
          <Champ type="tel" value={org.telephone ?? ''} onChange={(e) => f.poserOrganisation('telephone', e.target.value)} autoComplete="tel" placeholder="01 23 45 67 89" />
        </Field>
      </Groupe>

      <Groupe titre="Activités et zone">
          <Field label="Activités principales" rempli={texte(profil.activites)} aide="Ces mots sont repris dans vos mémoires techniques.">
            <ZoneTexte className="resize-none" rows={3} value={profil.activites ?? ''} onChange={(e) => f.poserProfil('activites', e.target.value)} placeholder="Maçonnerie, gros œuvre, rénovation…" />
          </Field>
          <Field label="Zone d’intervention géographique" rempli={texte(profil.zone_intervention)}>
            <Champ value={profil.zone_intervention ?? ''} onChange={(e) => f.poserProfil('zone_intervention', e.target.value)} placeholder="Île-de-France, Provence-Alpes-Côte d’Azur…" />
          </Field>
      </Groupe>

      <AfficherPlus>
        <Groupe titre="Informations légales">
          <Field label="Année de création" rempli={texte(profil.date_creation)}>
            <Champ className="max-w-32" value={profil.date_creation ?? ''} onChange={(e) => f.poserProfil('date_creation', e.target.value)} inputMode="numeric" placeholder="2005" />
          </Field>
          <Field label="Ville du greffe" rempli={texte(org.greffe_rcs)} aide="Registre du commerce ou des métiers">
            <Champ value={org.greffe_rcs ?? ''} onChange={(e) => f.poserOrganisation('greffe_rcs', e.target.value)} maxLength={80} placeholder="Reims" />
          </Field>
          <Field label="Capital social (€)" rempli={typeof org.capital_social === 'number'}>
            <ChampNombre className="max-w-56" valeur={typeof org.capital_social === 'number' ? org.capital_social : null} max={10_000_000_000} onChange={(v) => f.poserOrganisation('capital_social', v)} />
          </Field>
        </Groupe>
        <Groupe titre="Métiers et présentation">
          <Pleine>
            <Field label="Métiers exercés" groupe>
              {/* par ordre alphabétique (« Autre » en dernier), en colonnes : on cherche son métier en descendant, pas case par case */}
              <div className="gap-x-4 sm:columns-2 lg:columns-3 [&>*]:break-inside-avoid">
                {[...METIERS].sort((a, b) => Number(a.code === 'autre') - Number(b.code === 'autre') || a.libelle.localeCompare(b.libelle, 'fr')).map((m) => (
                  <CaseACocher key={m.code} libelle={m.libelle} coche={metiers.includes(m.code)}
                    onChange={(coche) => f.poserProfil('metiers', coche ? [...metiers, m.code] : metiers.filter((c) => c !== m.code))} />
                ))}
              </div>
            </Field>
          </Pleine>
          <Field label="Départements d’intervention" rempli={(profil.departements_intervention ?? []).length > 0} aide="Codes séparés par une virgule : 14, 50, 61">
            <Champ
              value={departements ?? (profil.departements_intervention ?? []).join(', ')}
              onChange={(e) => { setDepartements(e.target.value); f.poserProfil('departements_intervention', lireDepartements(e.target.value)) }}
              onBlur={() => setDepartements(null)}
              placeholder="51, 02, 08"
            />
          </Field>
          <Pleine>
            <Field label="Présentation en quelques lignes" rempli={texte(org.presentation)}>
              <ZoneTexte className="resize-none" rows={4} value={org.presentation ?? ''} onChange={(e) => f.poserOrganisation('presentation', e.target.value)} placeholder="Entreprise générale de bâtiment, nous intervenons en…" />
            </Field>
          </Pleine>
          <Pleine>
            <Field label="Historique et parcours" rempli={texte(profil.historique)}>
              <ZoneTexte className="resize-none" rows={4} value={profil.historique ?? ''} onChange={(e) => f.poserProfil('historique', e.target.value)} placeholder="Fondée en 2005, notre entreprise…" />
            </Field>
          </Pleine>
        </Groupe>
      </AfficherPlus>
    </CadreFormulaire>
  )
}
