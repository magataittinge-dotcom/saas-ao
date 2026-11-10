import type { ReactNode } from 'react'
import { Champ, ZoneTexte } from '@/components/ui/champ'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import { POSTES_PAR_DEFAUT } from '@/lib/entreprise/charges'
import { planifier } from '@/lib/entreprise/liste'
import type { PosteCle, TeamMember } from '@/types'
import { appliquerPlan } from './appliquerPlan'
import { cn } from '@/lib/utils'
import { AfficherPlus, BLOC_LISTE, BoutonAjout, BoutonRetrait, ChampNombre, Field, Groupe, Pleine } from './champs'
import CadreFormulaire from './CadreFormulaire'
import { EditeurHabilitations, EditeurMoyens, EditeurPersonnes, EffectifParSpecialite, EffectifSimple, HabilitationSst } from './ListesMoyens'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { useLignesEditables } from './useLignesEditables'

const CHAMPS_PERSONNE: (keyof TeamMember)[] = ['name', 'role', 'specialite', 'experience_years', 'certifications', 'experience_resume']

const rempliTexte = (v: unknown): boolean => typeof v === 'string' && v.trim() !== ''

/**
 * Rubrique Moyens humains et matériels : l'équipe, les effectifs, le matériel, la sécurité, la qualité et l'environnement.
 * Le profil s'écrit par PUT /memoire-config, les personnes clés par /users/team : un seul « Enregistrer » (dans l'en-tête).
 * Trois groupes ; l'indispensable d'abord, le reste derrière « Afficher les informations utiles et en option ».
 */
export default function FormMoyens({ donnees, avant, idPanneau, idOnglet }: { donnees: DonneesEntreprise; avant?: ReactNode; idPanneau?: string; idOnglet?: string }) {
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
    <Field label={libelle} key={champ} rempli={rempliTexte(p[champ])}>
      <ZoneTexte rows={lignes} placeholder={exemple} value={(p[champ] as string | undefined) ?? ''} onChange={(e) => f.poserProfil(champ, e.target.value)} />
    </Field>
  )

  return (
    <CadreFormulaire
      rubrique="moyens" titre="Moyens humains et matériels" idPanneau={idPanneau} idOnglet={idOnglet}
      explication="Vos équipes, vos véhicules, votre outillage, votre sécurité : la partie « moyens » du mémoire technique."
      etat={f} onEnregistrer={f.enregistrer} avant={avant}
    >
      <Groupe titre="Équipe" aide="Les postes qui portent vos chantiers, les personnes clés citées dans vos dossiers, et des effectifs en nombres seulement : aucun nom de salarié n'est demandé.">
        <Pleine>
          <div className="space-y-3">
            {postes.map((poste, i) => (
              <div key={i} className={cn(BLOC_LISTE, 'grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]')}>
                <Field label="Poste">
                  <Champ aria-label={`Poste ${i + 1} : intitulé`} value={poste.poste} onChange={(e) => poserPostes(postes.map((x, j) => (j === i ? { ...x, poste: e.target.value } : x)))} />
                </Field>
                <Field label="Nom">
                  <Champ aria-label={`Poste ${i + 1} : nom`} value={poste.nom} onChange={(e) => poserPostes(postes.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
                </Field>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label="Rôle et missions">
                      <Champ aria-label={`Poste ${i + 1} : rôle et missions`} placeholder="Supervision…" value={poste.role} onChange={(e) => poserPostes(postes.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                    </Field>
                  </div>
                  {postes.length > 1 && (
                    <BoutonRetrait libelle="Retirer ce poste" onClick={() => poserPostes(postes.filter((_, j) => j !== i))} />
                  )}
                </div>
              </div>
            ))}
            <BoutonAjout onClick={() => poserPostes([...postes, { poste: '', nom: '', role: '' }])}>Ajouter un poste</BoutonAjout>
          </div>
        </Pleine>
        <Pleine>
          <Field label="Personnes clés" groupe aide="Spécialité, années d'expérience et qualifications : ce que les cadres « équipe » des dossiers demandent.">
            <EditeurPersonnes
              lignes={personnes.lignes}
              modifier={personnes.modifier}
              retirer={personnes.retirer}
              ajouter={() => personnes.ajouter({ name: '', role: '' })}
            />
          </Field>
        </Pleine>
        <EffectifSimple valeur={effectifs} categorie="encadrement" libelle="Effectif d'encadrement" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
        <HabilitationSst valeur={habilitations} onChange={(h) => f.poserProfil('habilitations', h)} />
        <Pleine>
          <EffectifParSpecialite valeur={effectifs} categorie="chef_equipe" libelle="Chefs d'équipe par spécialité" exemple="Maçonnerie" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
        </Pleine>
      </Groupe>

      <Groupe titre="Matériel et véhicules">
        <EditeurMoyens libelle="Matériel" valeur={p.materiel_liste ?? []} maximum={60} exemple="Échafaudage de façade" onChange={(l) => f.poserProfil('materiel_liste', l)} />
        <EditeurMoyens libelle="Véhicules" valeur={p.vehicules_liste ?? []} maximum={20} exemple="Fourgon 3,5 t" onChange={(l) => f.poserProfil('vehicules_liste', l)} />
      </Groupe>

      <Groupe titre="Sécurité, qualité, environnement">
        {texte('gestion_securite', 'Organisation de la sécurité', 4, 'Nous établissons un PPSPS dès le début…')}
        {texte('traitement_dechets', 'Gestion et traitement des déchets', 4, 'Tri sélectif sur chantier, bennes dédiées…')}
      </Groupe>

      <AfficherPlus>
        <Groupe titre="Équipe : le détail">
          <Pleine>
            <EffectifParSpecialite valeur={effectifs} categorie="ouvrier" libelle="Ouvriers et compagnons par spécialité" exemple="Maçons" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
          </Pleine>
          <EffectifSimple valeur={effectifs} categorie="administratif" libelle="Administratif" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
          <EffectifSimple valeur={effectifs} categorie="apprenti" libelle="Apprentis" onChange={(e) => f.poserProfil('effectifs_par_categorie', e)} />
          <Pleine><EditeurHabilitations valeur={habilitations} onChange={(h) => f.poserProfil('habilitations', h)} /></Pleine>
          {texte('organigramme_description', "Description de l'organigramme", 3, '1 gérant, 2 conducteurs de travaux, 8 ouvriers…')}
        </Groupe>
        <Groupe titre="Matériel, véhicules et partenaires">
          {texte('materiel', "Familles d'outillage", 3, 'Outillage électroportatif, coffrages, échafaudages…')}
          {texte('vehicules', 'Véhicules (description libre)', 3, '2 camions benne 3,5 t, 1 nacelle 12 m…')}
          {texte('moyens_informatiques', 'Moyens informatiques', 3, 'Logiciel de planning, tablettes de chantier…')}
          {texte('fournisseurs_principaux', 'Fournisseurs principaux', 4, 'Négoce de matériaux, location de matériel…')}
          {texte('sous_traitance_partenaires', 'Sous-traitance : partenaires habituels et travaux confiés', 4, 'Électricité et plomberie confiées à des partenaires locaux…')}
          <Field label="Part habituelle de sous-traitance (%)" rempli={typeof p.sous_traitance_part_pct === 'number'}>
            <ChampNombre max={100} valeur={p.sous_traitance_part_pct} onChange={(v) => f.poserProfil('sous_traitance_part_pct', v)} />
          </Field>
        </Groupe>
        <Groupe titre="Qualité, démarrage de chantier et environnement">
          {texte('demarche_qualite', 'Démarche qualité', 4, 'Notre démarche qualité repose sur…')}
          {texte('procedure_demarrage', 'Procédure de démarrage de chantier', 4, "Dès réception de l'ordre de service, nous…")}
          {texte('mesures_environnementales', 'Mesures environnementales', 4, 'Réduction des nuisances sonores, protection des riverains…')}
          {texte('sav_garantie', 'Service après-vente et garantie de parfait achèvement', 4, 'Intervention sous 48 heures…')}
        </Groupe>
      </AfficherPlus>
    </CadreFormulaire>
  )
}
