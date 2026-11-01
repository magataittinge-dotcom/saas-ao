import { useState } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { CA_VIDE } from '@/lib/entreprise/charges'
import type { CAEntry } from '@/types'
import { AfficherPlus, BOUTON_AJOUT, BOUTON_RETRAIT, Field, Groupe, PiedEnregistrer } from './champs'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { cn } from '@/lib/utils'

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function staticMapUrl(address: string): string {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=12&size=600x300&scale=2&maptype=roadmap&markers=color:red|${encodeURIComponent(address)}&key=${GMAPS_KEY}`
}

/**
 * Rubrique Identité : un seul formulaire, un seul « Enregistrer ». L'organisation (nom, adresse, présentation)
 * et le profil (dirigeant, activités, chiffre d'affaires…) s'écrivent chacun dans leur table, par leur route.
 */
export default function FormIdentite({ donnees }: { donnees: DonneesEntreprise }) {
  const f = useFormulaireRubrique('identite', donnees)
  const { organisation: org, profil } = f.brouillon
  const [erreurCarte, setErreurCarte] = useState(false)
  const adresse = typeof org.address === 'string' ? org.address : ''
  const ca: CAEntry[] = profil.chiffre_affaires?.length ? profil.chiffre_affaires : CA_VIDE()
  const poserCA = (lignes: CAEntry[]) => f.poserProfil('chiffre_affaires', lignes)

  return (
    <form onSubmit={(e) => { e.preventDefault(); f.enregistrer() }} className="space-y-6">
      <Groupe titre="Coordonnées légales" aide="Pré-remplies depuis le répertoire Sirene à l'inscription.">
        <Field label="Nom de l'entreprise">
          <Input value={org.name ?? ''} onChange={(e) => f.poserOrganisation('name', e.target.value)} required autoComplete="organization" />
        </Field>
        <Field label="SIRET" aide={donnees.organisation?.siret_verified ? 'Vérifié au répertoire Sirene' : undefined}>
          <Input value={donnees.organisation?.siret ?? ''} readOnly inputMode="numeric" />
        </Field>
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
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
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

      <Groupe titre="Chiffre d'affaires" aide="Les derniers exercices clos, hors taxes.">
        <div className="space-y-2">
          {ca.map((ligne, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label="Année" className="w-24" placeholder="Année" value={ligne.annee}
                onChange={(e) => poserCA(ca.map((r, j) => (j === i ? { ...r, annee: e.target.value } : r)))} />
              <Input aria-label="Montant" placeholder="1 200 000 €" value={ligne.montant}
                onChange={(e) => poserCA(ca.map((r, j) => (j === i ? { ...r, montant: e.target.value } : r)))} />
              {ca.length > 1 && (
                <button type="button" onClick={() => poserCA(ca.filter((_, j) => j !== i))} aria-label="Retirer cette année" className={BOUTON_RETRAIT}>
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => poserCA([...ca, { annee: '', montant: '' }])} className={cn(BOUTON_AJOUT, 'mt-1')}>
            <Plus size={13} aria-hidden /> Ajouter une année
          </button>
        </div>
      </Groupe>

      <AfficherPlus>
        <Field label="Date de création">
          <Input value={profil.date_creation ?? ''} onChange={(e) => f.poserProfil('date_creation', e.target.value)} placeholder="2005" />
        </Field>
        <Field label="Présentation en quelques lignes">
          <Textarea rows={4} value={org.presentation ?? ''} onChange={(e) => f.poserOrganisation('presentation', e.target.value)} />
        </Field>
        <Field label="Historique et parcours">
          <Textarea rows={4} value={profil.historique ?? ''} onChange={(e) => f.poserProfil('historique', e.target.value)} placeholder="Fondée en 2005, notre entreprise…" />
        </Field>
      </AfficherPlus>

      <PiedEnregistrer enCours={f.enCours} reussi={f.reussi} erreur={f.erreur} />
    </form>
  )
}
