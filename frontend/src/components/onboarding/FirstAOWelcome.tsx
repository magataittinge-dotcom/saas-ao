import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { prenomAffichable } from '@/lib/prenom'
import { Page, TitreSection } from '@/components/ui/page'
import { Carte } from '@/components/ui/carte'
import { Bouton } from '@/components/ui/bouton'
import { Champ, GroupeChamp } from '@/components/ui/champ'
import { Message } from '@/components/ui/message'
import { SynorixParle } from '@/components/ui/synorix-parle'
import ZoneDepotAO from './ZoneDepotAO'
import { FilSeptEtapes, PARTAGE_DES_ROLES } from './FilSeptEtapes'

/** Un SIRET : 14 chiffres (les espaces tapés par habitude sont tolérés). */
export const siretValide = (saisie: string): boolean => /^\d{14}$/.test(saisie.replace(/\s/g, ''))
export const ERREUR_SIRET = 'Un numéro SIRET compte 14 chiffres. Vérifiez votre saisie.'

/**
 * C15, A6 : le premier écran d'un nouveau client, sur l'accueil. Il dit en une ligne ce que fait Synorix, montre les sept
 * étapes et le partage des rôles (le visage : ici Synorix parle), puis demande UNE chose : le SIRET (le répertoire Sirene
 * remplit le profil), et ensuite le dossier de l'acheteur, offert. Un seul geste à la fois : « Valider », puis « Choisir un
 * fichier ». Le profil se complète ensuite au fil des réponses.
 */
export default function FirstAOWelcome() {
  const { organization, setOrganization, user } = useAuthStore()

  const [siret, setSiret] = useState('')
  const [siretBusy, setSiretBusy] = useState(false)
  const [siretMsg, setSiretMsg] = useState<string | null>(null)
  const [siretErreur, setSiretErreur] = useState<string | null>(null)
  const [siretDone, setSiretDone] = useState(!!organization?.siret)

  const submitSiret = async () => {
    // « Valider » reste un bouton plein (désactivé, il avait l'air éteint à côté de « Passer cette étape ») : une saisie
    // qui n'a pas 14 chiffres le dit sous le champ, au lieu d'un bouton muet.
    if (!siretValide(siret)) { setSiretErreur(ERREUR_SIRET); return }
    setSiretErreur(null)
    setSiretBusy(true)
    setSiretMsg(null)
    try {
      const res = await authService.sync({ siret: siret.replace(/\s/g, '') })
      setOrganization(res.organization)
      const warning = (res as { siret_warning?: string }).siret_warning
      if (warning) setSiretMsg(warning)
      setSiretDone(true)
    } catch {
      setSiretMsg('La vérification du SIRET n’a pas abouti pour le moment. Vous pourrez le renseigner plus tard dans Mon entreprise.')
      setSiretDone(true)
    } finally {
      setSiretBusy(false)
    }
  }

  const prenom = prenomAffichable(user?.name, user?.email)

  return (
    <Page etroite titre={prenom ? `Bienvenue, ${prenom}` : 'Bienvenue'}>
      <SynorixParle>{PARTAGE_DES_ROLES}</SynorixParle>

      {!siretDone ? (
        <Carte className="mt-8">
          <h2 className="text-lg font-semibold text-fg">Pour commencer, votre numéro SIRET</h2>
          <p className="mt-1.5 text-sm text-fg-2">Rien d’autre à saisir : le répertoire Sirene remplit le reste de votre profil.</p>
          <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void submitSiret() }}>
            <GroupeChamp libelle="Numéro SIRET" aide="14 chiffres, sans espace." erreur={siretErreur ?? undefined} className="min-w-0 flex-1 basis-64">
              <Champ value={siret} onChange={(e) => { setSiret(e.target.value); setSiretErreur(null) }} aria-label="Numéro SIRET" inputMode="numeric" autoComplete="off" />
            </GroupeChamp>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Bouton variante="principal" onClick={() => { void submitSiret() }} enCours={siretBusy} libelleEnCours="Vérification…">Valider</Bouton>
            <Bouton variante="lien" onClick={() => setSiretDone(true)}>Passer cette étape</Bouton>
          </div>
        </Carte>
      ) : (
        <div className="mt-8">
          {siretMsg && <Message ton="attention" className="mb-4">{siretMsg}</Message>}
          <ZoneDepotAO geste
            titre="Déposez le dossier de l’acheteur"
            precision="Votre premier appel d’offres est offert : analyse, pièces et mémoire compris. ZIP complet ou PDF." />
          <p className="mt-4 text-sm text-fg-2">Votre profil se complétera au fil de vos réponses.</p>
        </div>
      )}

      {/* ce qui vient ensuite : le chemin d'un appel d'offres, dessiné (le bas de l'écran n'est plus un vide) */}
      <TitreSection id="ensuite">Ensuite, les sept étapes d’un appel d’offres</TitreSection>
      <section aria-labelledby="ensuite">
        <FilSeptEtapes />
        <p className="mt-5 text-sm text-fg-2">{siretDone ? 'Du dépôt du dossier à l’export, Synorix vous dit à chaque étape ce qu’il a lu et ce qu’il vous reste à décider.' : 'Votre premier appel d’offres est offert : analyse, pièces et mémoire compris.'}</p>
      </section>
    </Page>
  )
}
