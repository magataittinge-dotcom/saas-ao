import { Plus, Trash2 } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { POSTES_PAR_DEFAUT } from '@/lib/entreprise/charges'
import { planifier } from '@/lib/entreprise/liste'
import type { PosteCle, TeamMember } from '@/types'
import { appliquerPlan } from './appliquerPlan'
import { AfficherPlus, BOUTON_AJOUT, BOUTON_RETRAIT, ChampNombre, Field, Groupe, PiedEnregistrer } from './champs'
import { EditeurHabilitations, EditeurMoyens, EditeurPersonnes, EffectifParSpecialite, EffectifSimple, HabilitationSst } from './ListesMoyens'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { useLignesEditables } from './useLignesEditables'

const CHAMPS_PERSONNE: (keyof TeamMember)[] = ['name', 'role', 'specialite', 'experience_years', 'certifications', 'experience_resume']

/**
 * Rubrique Moyens humains et matériels : l'équipe, les effectifs, le matériel, l'organisation du chantier.
 * Le profil s'écrit par PUT /memoire-config, les personnes clés par /users/team : un seul « Enregistrer ».
 * L'indispensable d'abord, le reste à la demande.
 */
export default function FormMoyens({ donnees }: { donnees: DonneesEntreprise }) {
  const personnes = useLignesEditables<TeamMember>(donnees.equipe as TeamMember[] | null)
  const f = useFormulaireRubrique('moyens', donnees, {
    invalider: ['team'],
    enregistrer: async () => {
      const plan = planifier<TeamMember>(donnees.equipe as TeamMember[] | null, personnes.lignes, CHAMPS_PERSONNE, 'name')
      await appliquerPlan('/users/team', plan, (c) => ({ ...c, role: c.role ?? '' }))
    },
  })
  const p = f.brouillon.profil
  const postes: PosteCle[] = p.postes_cles?.length ? p.postes_cles : POSTES_PAR_DEFAUT()
  const poserPostes = (l: PosteCle[]) => f.poserProfil('postes_cles', l)
  const effectifs = p.effectifs_par_categorie ?? []
  const habilitations = p.habilitations ?? []
  const texte = (champ: 'materiel' | 'vehicules' | 'gestion_securite' | 'traitement_dechets' | 'organigramme_description' | 'moyens_informatiques' | 'demarche_qualite' | 'procedure_demarrage' | 'mesures_environnementales' | 'fournisseurs_principaux' | 'sous_traitance_partenaires' | 'sav_garantie', libelle: string, lignes: number, exemple: string) => (
    <Field label={libelle} key={champ}>
      <Textarea rows={lignes} placeholder={exemple} value={(p[champ] as string | undefined) ?? ''} onChange={(e) => f.poserProfil(champ, e.target.value)} />
    </Field>
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); f.enregistrer() }} className="space-y-6">
      <Groupe titre="Équipe" aide="Les postes qui portent vos chantiers, et les personnes clés citées dans vos dossiers.">
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
        <Field label="Personnes clés" groupe aide="Spécialité, années d'expérience et qualifications : ce que les cadres « équipe » des dossiers demandent.">
          <EditeurPersonnes
            lignes={personnes.lignes}
            modifier={personnes.modifier}
            retirer={personnes.retirer}
            ajouter={() => personnes.ajouter({ name: '', role: '' })}
          />
        </Field>
      </Groupe>

      <Groupe titre="Effectifs" aide="Des nombres seulement : aucun nom de salarié n'est demandé.">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
          <EffectifSimple valeur={effectifs} categorie="encadrement" libelle="Effectif d'encadrement" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
          <HabilitationSst valeur={habilitations} onChange={(h) => f.poserProfil('habilitations', h)} />
        </div>
        <EffectifParSpecialite valeur={effectifs} categorie="chef_equipe" libelle="Chefs d'équipe par spécialité" exemple="Maçonnerie" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
      </Groupe>

      <Groupe titre="Matériel et véhicules">
        <EditeurMoyens libelle="Matériel" valeur={p.materiel_liste ?? []} maximum={60} exemple="Échafaudage de façade" onChange={(l) => f.poserProfil('materiel_liste', l)} />
        <EditeurMoyens libelle="Véhicules" valeur={p.vehicules_liste ?? []} maximum={20} exemple="Fourgon 3,5 t" onChange={(l) => f.poserProfil('vehicules_liste', l)} />
      </Groupe>

      <Groupe titre="Organisation du chantier">
        {texte('gestion_securite', 'Organisation de la sécurité', 4, 'Nous établissons un PPSPS dès le début…')}
        {texte('traitement_dechets', 'Gestion et traitement des déchets', 4, 'Tri sélectif sur chantier, bennes dédiées…')}
      </Groupe>

      <AfficherPlus>
        <EffectifParSpecialite valeur={effectifs} categorie="ouvrier" libelle="Ouvriers et compagnons par spécialité" exemple="Maçons" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
          <EffectifSimple valeur={effectifs} categorie="administratif" libelle="Administratif" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
          <EffectifSimple valeur={effectifs} categorie="apprenti" libelle="Apprentis" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
        </div>
        <EditeurHabilitations valeur={habilitations} onChange={(h) => f.poserProfil('habilitations', h)} />
        {texte('materiel', "Familles d'outillage", 3, 'Outillage électroportatif, coffrages, échafaudages…')}
        {texte('vehicules', 'Véhicules (description libre)', 3, '2 camions benne 3,5 t, 1 nacelle 12 m…')}
        {texte('organigramme_description', "Description de l'organigramme", 3, '1 gérant, 2 conducteurs de travaux, 8 ouvriers…')}
        {texte('moyens_informatiques', 'Moyens informatiques', 3, 'Logiciel de planning, tablettes de chantier…')}
        {texte('demarche_qualite', 'Démarche qualité', 4, 'Notre démarche qualité repose sur…')}
        {texte('procedure_demarrage', 'Procédure de démarrage de chantier', 4, "Dès réception de l'ordre de service, nous…")}
        {texte('mesures_environnementales', 'Mesures environnementales', 4, 'Réduction des nuisances sonores, protection des riverains…')}
        {texte('sav_garantie', 'Service après-vente et garantie de parfait achèvement', 4, 'Intervention sous 48 heures…')}
        {texte('fournisseurs_principaux', 'Fournisseurs principaux', 4, 'Négoce de matériaux, location de matériel…')}
        {texte('sous_traitance_partenaires', 'Sous-traitance : partenaires habituels et travaux confiés', 4, 'Électricité et plomberie confiées à des partenaires locaux…')}
        <Field label="Part habituelle de sous-traitance (%)">
          <ChampNombre max={100} valeur={p.sous_traitance_part_pct} onChange={(v) => f.poserProfil('sous_traitance_part_pct', v)} />
        </Field>
      </AfficherPlus>

      <PiedEnregistrer enCours={f.enCours} reussi={f.reussi} erreur={f.erreur} />
    </form>
  )
}
