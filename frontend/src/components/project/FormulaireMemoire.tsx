import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import MemoirePreflight, { QuotaMemoire, type PreflightSelection } from '@/components/project/MemoirePreflight'
import type { VariablesMemoire } from '@/lib/memoireGeneration'
import { useDonneesEntreprise } from '@/components/entreprise/useDonneesEntreprise'
import { avancementTotal, libelleAvancement, type DonneesEntreprise } from '@/lib/entreprise/avancement'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { Champ, ChampNombre, GroupeChamp, ZoneTexte } from '@/components/ui/champ'
import { Message } from '@/components/ui/message'

interface Props {
  projectId: string
  variables: VariablesMemoire
  onVariables: (v: VariablesMemoire) => void
  onPreflight: (sel: PreflightSelection) => void
  /** Ancien compte du serveur (18 champs) : plus lu, le profil se compte comme dans Mon entreprise (R23). */
  stats?: { filled: number; total: number; nom_entreprise: string | null } | null
  hasMemoire: boolean
  /** Une génération est en cours (ou en reprise après rechargement). */
  enCours: boolean
  erreur: string | null
  /** La dernière rédaction s'est arrêtée avant la fin (pas un refus au lancement) : le geste devient « Relancer la rédaction ». */
  echec?: boolean
  onGenerer: () => void
}

/** Le profil en une ligne : le compte de Mon entreprise (informations indispensables), ou rien tant que les données ne sont pas là. */
export function LigneProfil({ donnees }: { donnees: DonneesEntreprise | null }) {
  if (!donnees) return null
  return (
    <p className="text-sm text-fg-2">
      Profil de l’entreprise : <span className="chiffres">{libelleAvancement(avancementTotal(donnees))}</span>
      {' · '}
      <Link to="/company" className="font-medium text-fg underline underline-offset-2">Compléter</Link>
    </p>
  )
}

/**
 * S5 — préparation du mémoire. En haut : les 2 champs demandés et le bouton, le profil en une ligne.
 * En dessous, repliés : planning, annexes, références, équipe et matériel. Le repli est un <details> :
 * son contenu reste monté, donc la sélection du pré-contrôle part au serveur même repliée.
 * Champs, bouton, carte et message sont ceux du système ; les deux champs du haut sont les seuls demandés, tout ce qui
 * est dans le repli est facultatif (le titre du repli le dit une fois).
 */
export default function FormulaireMemoire({
  projectId, variables, onVariables, onPreflight, hasMemoire, enCours, erreur, echec = false, onGenerer,
}: Props) {
  // R23 — un seul compte : les informations indispensables de Mon entreprise (identité, moyens, certifications).
  const donnees = useDonneesEntreprise()
  const maj = (cle: keyof VariablesMemoire) => (e: { target: { value: string } }) =>
    onVariables({ ...variables, [cle]: e.target.value })
  const ouvriers = variables.nb_ouvriers === '' ? null : Number(variables.nb_ouvriers)

  return (
    <div className="space-y-4">
      {/* ── L'essentiel : 2 champs, un bouton ── */}
      <Carte className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <GroupeChamp libelle="Nombre d’ouvriers dédiés" aide="Exemple : 4">
            <ChampNombre
              valeur={Number.isFinite(ouvriers) ? ouvriers : null} min={0}
              onChange={(n) => onVariables({ ...variables, nb_ouvriers: n == null ? '' : String(Math.round(n)) })}
            />
          </GroupeChamp>
          <GroupeChamp libelle="Délai estimé" aide="Exemple : 3 mois">
            <Champ value={variables.delai} onChange={maj('delai')} />
          </GroupeChamp>
        </div>

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Bouton variante="principal" onClick={onGenerer} disabled={enCours || !variables.nb_ouvriers || !variables.delai}>
            {echec ? 'Relancer la rédaction' : hasMemoire ? 'Régénérer le mémoire' : 'Rédiger le mémoire'}
          </Bouton>
          <QuotaMemoire projectId={projectId} />
          {/* le bouton attend les deux champs : l'écran dit lesquels (jury, tour 3 : un aplat grisé sans explication) */}
          {!enCours && (!variables.nb_ouvriers || !variables.delai) && (
            <p className="basis-full text-sm text-fg-2">Indiquez le nombre d’ouvriers dédiés et le délai estimé : la rédaction se lance ensuite.</p>
          )}
        </div>
      </Carte>

      {/* ── Le profil, en une ligne ── */}
      <LigneProfil donnees={donnees.profil ? donnees : null} />

      {/* ── Options, repliées ── */}
      <details className="group rounded-carte border border-bord">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
          Options (facultatif)
          <span className="flex items-center gap-2 text-xs font-normal text-fg-3">
            profil local, références, planning, annexes, équipe, matériel
            <ChevronDown aria-hidden size={18} strokeWidth={1.5} className="shrink-0 transition-transform duration-survol ease-survol group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <div className="space-y-4 px-4 pb-4">
          <MemoirePreflight projectId={projectId} onChange={onPreflight} />

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Informations spécifiques à ce chantier</h3>
              <p className="mt-1 text-xs text-fg-3">Ces informations seront intégrées dans le mémoire de cet appel d’offres.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <GroupeChamp libelle="Chef de chantier — nom" aide="Exemple : Jean Dupont">
                <Champ value={variables.chef_chantier_nom} onChange={maj('chef_chantier_nom')} />
              </GroupeChamp>
              <GroupeChamp libelle="Qualification du chef de chantier" aide="Exemple : 15 ans d’expérience, CACES R482">
                <Champ value={variables.chef_chantier_qualification} onChange={maj('chef_chantier_qualification')} />
              </GroupeChamp>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <GroupeChamp libelle="Conducteur de travaux — nom" aide="Exemple : Marie Martin">
                <Champ value={variables.conducteur_travaux_nom} onChange={maj('conducteur_travaux_nom')} />
              </GroupeChamp>
              <GroupeChamp libelle="Qualification du conducteur de travaux" aide="Exemple : ingénieur BTP, 10 ans ITE/ravalement">
                <Champ value={variables.conducteur_travaux_qualification} onChange={maj('conducteur_travaux_qualification')} />
              </GroupeChamp>
            </div>

            <GroupeChamp libelle="Matériel spécifique au chantier" aide="Exemple : échafaudage tubulaire R200, nacelle articulée 20 m…">
              <ZoneTexte value={variables.materiel_specifique} onChange={maj('materiel_specifique')} rows={2} />
            </GroupeChamp>

            <GroupeChamp libelle="Contraintes particulières" aide="Exemple : site occupé, horaires restreints 8 h-17 h…">
              <ZoneTexte value={variables.particularites} onChange={maj('particularites')} rows={2} />
            </GroupeChamp>
          </div>
        </div>
      </details>
    </div>
  )
}
