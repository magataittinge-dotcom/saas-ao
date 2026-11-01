import { Plus, Trash2 } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { POSTES_PAR_DEFAUT } from '@/lib/entreprise/charges'
import type { PosteCle } from '@/types'
import { AfficherPlus, BOUTON_AJOUT, BOUTON_RETRAIT, Field, Groupe, PiedEnregistrer } from './champs'
import { useFormulaireRubrique } from './useFormulaireRubrique'

/**
 * Rubrique Moyens humains et matériels : l'équipe, le matériel, l'organisation du chantier. Tout s'écrit dans le
 * profil (PUT /memoire-config) avec un seul « Enregistrer ». L'indispensable d'abord, le reste à la demande.
 */
export default function FormMoyens({ donnees }: { donnees: DonneesEntreprise }) {
  const f = useFormulaireRubrique('moyens', donnees)
  const p = f.brouillon.profil
  const postes: PosteCle[] = p.postes_cles?.length ? p.postes_cles : POSTES_PAR_DEFAUT()
  const poserPostes = (l: PosteCle[]) => f.poserProfil('postes_cles', l)
  const texte = (champ: 'materiel' | 'vehicules' | 'gestion_securite' | 'traitement_dechets' | 'organigramme_description' | 'moyens_informatiques' | 'demarche_qualite' | 'procedure_demarrage' | 'mesures_environnementales' | 'fournisseurs_principaux', libelle: string, lignes: number, exemple: string) => (
    <Field label={libelle} key={champ}>
      <Textarea rows={lignes} placeholder={exemple} value={(p[champ] as string | undefined) ?? ''} onChange={(e) => f.poserProfil(champ, e.target.value)} />
    </Field>
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); f.enregistrer() }} className="space-y-6">
      <Groupe titre="Équipe" aide="Les postes qui portent vos chantiers.">
        <div className="space-y-3">
          {postes.map((poste, i) => (
            <div key={i} className="grid items-start gap-2 rounded-lg border border-bord bg-surface-0 p-3 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
              <Field label="Poste">
                <Input aria-label={`Poste ${i + 1} : intitulé`} value={poste.poste} onChange={(e) => poserPostes(postes.map((x, j) => (j === i ? { ...x, poste: e.target.value } : x)))} />
              </Field>
              <Field label="Nom">
                <Input aria-label={`Poste ${i + 1} : nom`} placeholder="Jean Dupont" value={poste.nom} onChange={(e) => poserPostes(postes.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
              </Field>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Rôle et missions">
                    <Input aria-label={`Poste ${i + 1} : rôle et missions`} placeholder="Supervision…" value={poste.role} onChange={(e) => poserPostes(postes.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                  </Field>
                </div>
                {postes.length > 1 && (
                  <button type="button" onClick={() => poserPostes(postes.filter((_, j) => j !== i))} aria-label="Retirer ce poste" className={BOUTON_RETRAIT}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => poserPostes([...postes, { poste: '', nom: '', role: '' }])} className={BOUTON_AJOUT}>
            <Plus size={13} aria-hidden /> Ajouter un poste
          </button>
        </div>
      </Groupe>

      <Groupe titre="Matériel et véhicules">
        {texte('materiel', 'Matériel', 3, 'Bétonnières, coffrages métalliques, échafaudages…')}
        {texte('vehicules', 'Véhicules', 3, '2 camions benne 3,5 t, 1 nacelle 12 m…')}
      </Groupe>

      <Groupe titre="Organisation du chantier">
        {texte('gestion_securite', 'Organisation de la sécurité', 4, 'Nous établissons un PPSPS dès le début…')}
        {texte('traitement_dechets', 'Gestion et traitement des déchets', 4, 'Tri sélectif sur chantier, bennes dédiées…')}
      </Groupe>

      <AfficherPlus>
        {texte('organigramme_description', "Description de l'organigramme", 3, '1 gérant, 2 conducteurs de travaux, 8 ouvriers…')}
        {texte('moyens_informatiques', 'Moyens informatiques', 3, 'Logiciel de planning, tablettes de chantier…')}
        {texte('demarche_qualite', 'Démarche qualité', 4, 'Notre démarche qualité repose sur…')}
        {texte('procedure_demarrage', 'Procédure de démarrage de chantier', 4, "Dès réception de l'ordre de service, nous…")}
        {texte('mesures_environnementales', 'Mesures environnementales', 4, 'Réduction des nuisances sonores, protection des riverains…')}
        {texte('fournisseurs_principaux', 'Fournisseurs principaux', 4, 'Négoce de matériaux, location de matériel…')}
      </AfficherPlus>

      <PiedEnregistrer enCours={f.enCours} reussi={f.reussi} erreur={f.erreur} />
    </form>
  )
}
