import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useDonneesEntreprise } from '@/components/entreprise/useDonneesEntreprise'
import SceneVisage from '@/components/entreprise/SceneVisage'
import { ContexteVisage } from '@/components/entreprise/ContexteVisage'
import type { VisageAnimeRef } from '@/components/entreprise/VisageAnime'
import RubriquesEntreprise from '@/components/entreprise/RubriquesEntreprise'
import FormIdentite from '@/components/entreprise/FormIdentite'
import FormMoyens from '@/components/entreprise/FormMoyens'
import FormCertifications from '@/components/entreprise/FormCertifications'
import CommencerParSiret from '@/components/entreprise/CommencerParSiret'
import ProfileFreeTextCard from '@/components/company/ProfileFreeTextCard'
import CasesDepot from '@/components/entreprise/CasesDepot'
import { AfficherPlus } from '@/components/entreprise/champs'
import { Page } from '@/components/ui/page'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { Squelette, SqueletteLignes } from '@/components/ui/squelette'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import { rubriqueDepuisRecherche, type RubriqueId } from '@/lib/entreprise/avancement'
import { champDepuisRecherche } from '@/lib/entreprise/champsFiche'
import { entrepriseVide } from '@/lib/entreprise/vide'
import { useFocusChamp } from '@/components/entreprise/useFocusChamp'

// Texte libre → Synorix le range en rubriques → l'utilisateur valide avant toute écriture (C7). Repliée : la saisie guidée vient d'abord.
// Sous « Décrire avec vos mots », les cases de dépôt de la rubrique : un document par case, Synorix lit et propose, le patron valide.
const DecrireEtDeposer = ({ rubrique }: { rubrique: RubriqueId }) => (
  <div className="grid gap-6">
    {rubrique !== 'certifications' && (
      <AfficherPlus libelle="Décrire avec vos mots" libelleOuvert="Décrire avec vos mots">
        <ProfileFreeTextCard />
      </AfficherPlus>
    )}
    <CasesDepot rubrique={rubrique} />
  </div>
)

/** L'attente : la place du visage, de la phrase et des trois rubriques (fixe, aux dimensions du contenu). */
function SqueletteEntreprise() {
  return (
    <div className="grid items-center gap-x-10 gap-y-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* la place du visage est gardée (aucun saut à l'arrivée), sans bloc gris : un visage n'est pas un rectangle */}
      <div aria-hidden="true" className="h-[336px] w-[240px] justify-self-center lg:h-[420px] lg:w-[300px]" />
      <div className="grid gap-6">
        <SqueletteLignes lignes={2} className="max-w-xl" />
        <Squelette className="h-48 rounded-carte" />
      </div>
    </div>
  )
}

// « Mon entreprise » : le profil vivant, en trois rubriques (Identité, Moyens humains et matériels, Certifications et
// références). En haut, le visage de Synorix à côté de sa phrase (ce qu'il sait, la prochaine information utile), une
// fois ; les trois rubriques en rangées d'une même surface ; puis le formulaire de la rubrique ouverte, en pleine largeur.
// Un formulaire et un « Enregistrer » par rubrique ; chaque donnée reste dans sa table (organisation, profil mémoire,
// équipe, références, coffre-fort). Lecture : chargement → erreur → profil vide (le SIRET) → contenu.
export default function Company() {
  // /company?rubrique=moyens (Équipe) ou =certifications (Mes références) ouvre la rubrique demandée, même si l'écran est déjà affiché.
  const { search } = useLocation()
  const demandee = rubriqueDepuisRecherche(search)
  const [rubrique, setRubrique] = useState<RubriqueId>(demandee ?? 'identite')
  useEffect(() => { if (demandee) setRubrique(demandee) }, [demandee])
  const donnees = useDonneesEntreprise()
  const mouvementReduit = useMouvementReduit()
  // /company?rubrique=moyens&champ=materiel (liens « Renseigner » de la fiche à télécharger) : le champ prend le focus.
  useFocusChamp(champDepuisRecherche(search), rubrique, donnees.profilCharge, mouvementReduit)
  const visage = useRef<VisageAnimeRef>(null)
  const actions = useRef({ eclair: () => visage.current?.eclair() }).current
  const [aDefiler, setADefiler] = useState(0)
  // Profil vide : une seule première action, le SIRET. « À la main » (ou une demande explicite d'une rubrique) ouvre la page complète.
  const [saisieManuelle, setSaisieManuelle] = useState(false)
  const premiereAction = !saisieManuelle && !demandee && entrepriseVide(donnees)

  // Choisir une rubrique : elle s'ouvre et le visage joue l'éclair.
  const choisir = (r: RubriqueId) => { setRubrique(r); visage.current?.eclair() }
  // Le lien de la phrase de Synorix ramène en plus le formulaire à l'écran.
  const choisirDepuisLaPhrase = (r: RubriqueId) => { choisir(r); setADefiler((n) => n + 1) }
  useEffect(() => {
    if (aDefiler === 0) return
    document.querySelector('[role="tabpanel"]')?.scrollIntoView({ behavior: mouvementReduit ? 'auto' : 'smooth', block: 'start' })
  }, [aDefiler, mouvementReduit])

  // Le motif de requête du système : sans réponse du serveur, on ne sait pas si le profil est vide.
  const requete = {
    data: donnees.profilCharge && !donnees.enErreur ? donnees : undefined,
    isLoading: !donnees.profilCharge,
    isError: donnees.enErreur,
  }

  return (
    <ContexteVisage.Provider value={actions}>
      <Page titre="Mon entreprise" sousTitre="Renseignée une fois, reprise dans chaque mémoire technique.">
        <EtatRequete
          requete={requete}
          squelette={<SqueletteEntreprise />}
          erreur={(
            <EtatErreur
              titre="Vos informations n’ont pas pu s’afficher"
              detail={<span className="block text-pretty">La connexion au serveur a échoué. Vos informations sont toujours enregistrées : rien n’a été modifié.</span>}
              onReessayer={donnees.recharger}
              enCours={donnees.rechargement}
            />
          )}
          estVide={() => premiereAction}
          vide={<CommencerParSiret onPasser={() => setSaisieManuelle(true)} />}
        >
          {() => (
            <RubriquesEntreprise
              donnees={donnees}
              rubrique={rubrique}
              onChoisir={choisir}
              scene={(rangees) => <SceneVisage ref={visage} donnees={donnees} onChoisir={choisirDepuisLaPhrase}>{rangees}</SceneVisage>}
              panneaux={{
                identite: (ids) => <FormIdentite donnees={donnees} avant={<DecrireEtDeposer rubrique="identite" />} idPanneau={ids.panneau} idOnglet={ids.onglet} />,
                moyens: (ids) => <FormMoyens donnees={donnees} avant={<DecrireEtDeposer rubrique="moyens" />} idPanneau={ids.panneau} idOnglet={ids.onglet} />,
                certifications: (ids) => <FormCertifications donnees={donnees} avant={<DecrireEtDeposer rubrique="certifications" />} idPanneau={ids.panneau} idOnglet={ids.onglet} />,
              }}
            />
          )}
        </EtatRequete>
      </Page>
    </ContexteVisage.Provider>
  )
}
