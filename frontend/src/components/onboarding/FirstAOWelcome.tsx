import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { prenomAffichable } from '@/lib/prenom'
import { Page } from '@/components/ui/page'
import { Carte } from '@/components/ui/carte'
import { Bouton } from '@/components/ui/bouton'
import { Champ, GroupeChamp } from '@/components/ui/champ'
import { Message } from '@/components/ui/message'
import { SynorixParle } from '@/components/ui/synorix-parle'
import ZoneDepotAO from './ZoneDepotAO'
import { FilSeptEtapes, PARTAGE_DES_ROLES } from './FilSeptEtapes'

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
  const [siretDone, setSiretDone] = useState(!!organization?.siret)

  const submitSiret = async () => {
    if (!siret.trim()) return
    setSiretBusy(true)
    setSiretMsg(null)
    try {
      const res = await authService.sync({ siret: siret.trim() })
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
    <Page etroite titre={prenom ? `Bienvenue, ${prenom}` : 'Bienvenue'}
      sousTitre="Synorix lit le dossier de l’acheteur, relève chaque exigence avec sa source et rédige votre mémoire technique.">
      <FilSeptEtapes />
      <SynorixParle className="mt-5">{PARTAGE_DES_ROLES}</SynorixParle>

      {!siretDone ? (
        <Carte className="mt-8">
          <h2 className="text-lg font-semibold text-fg">Pour commencer, votre numéro SIRET</h2>
          <p className="mt-1.5 text-sm text-fg-2">Rien d’autre à saisir : le répertoire Sirene remplit le reste de votre profil.</p>
          <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void submitSiret() }}>
            <GroupeChamp libelle="Numéro SIRET" aide="14 chiffres, sans espace." className="min-w-0 flex-1 basis-64">
              <Champ value={siret} onChange={(e) => setSiret(e.target.value)} aria-label="Numéro SIRET" inputMode="numeric" autoComplete="off" />
            </GroupeChamp>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Bouton variante="principal" onClick={() => { void submitSiret() }} disabled={!siret.trim()} enCours={siretBusy} libelleEnCours="Vérification…">Valider</Bouton>
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
    </Page>
  )
}
