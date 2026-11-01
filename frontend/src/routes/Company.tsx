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
import ProfileFreeTextCard from '@/components/company/ProfileFreeTextCard'
import CasesDepot from '@/components/entreprise/CasesDepot'
import { AfficherPlus } from '@/components/entreprise/champs'
import { MemoireSkeleton } from '@/components/skeletons'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import { rubriqueDepuisRecherche, type RubriqueId } from '@/lib/entreprise/avancement'

// Texte libre → l'IA structure → l'utilisateur valide avant toute écriture (C7). Repliée : la saisie guidée vient d'abord.
// Sous « Décrire avec vos mots », les cases de dépôt de la rubrique : un document par case, Synorix lit et propose, le patron valide.
const DecrireEtDeposer = ({ rubrique }: { rubrique: RubriqueId }) => (
  <div className="space-y-6">
    {rubrique !== 'certifications' && (
      <AfficherPlus libelle="Décrire avec vos mots" libelleOuvert="Masquer">
        <ProfileFreeTextCard />
      </AfficherPlus>
    )}
    <CasesDepot rubrique={rubrique} />
  </div>
)

// « Mon entreprise » : le profil vivant, en trois rubriques (Identité, Moyens humains et matériels,
// Certifications et références). Le visage de Synorix et six bulles en haut, trois cartes égales, puis le formulaire de la
// rubrique choisie en pleine largeur. Un formulaire et un « Enregistrer » par rubrique ; chaque donnée reste dans
// sa table actuelle (organisation, profil mémoire, équipe, références, coffre-fort).
export default function Company() {
  // /company?rubrique=moyens (Équipe) ou =certifications (Mes références) ouvre la rubrique demandée, même si l'écran est déjà affiché.
  const demandee = rubriqueDepuisRecherche(useLocation().search)
  const [rubrique, setRubrique] = useState<RubriqueId>(demandee ?? 'identite')
  useEffect(() => { if (demandee) setRubrique(demandee) }, [demandee])
  const donnees = useDonneesEntreprise()
  const mouvementReduit = useMouvementReduit()
  const visage = useRef<VisageAnimeRef>(null)
  const actions = useRef({ eclair: () => visage.current?.eclair() }).current
  const [aDefiler, setADefiler] = useState(0)

  // Choisir une rubrique (carte ou bulle) : elle s'ouvre et le visage joue l'éclair.
  const choisir = (r: RubriqueId) => { setRubrique(r); visage.current?.eclair() }
  // Une bulle ramène en plus le formulaire à l'écran (il est sous les cartes).
  const choisirDepuisBulle = (r: RubriqueId) => { choisir(r); setADefiler((n) => n + 1) }
  useEffect(() => {
    if (aDefiler === 0) return
    document.querySelector('[role="tabpanel"]')?.scrollIntoView({ behavior: mouvementReduit ? 'auto' : 'smooth', block: 'start' })
  }, [aDefiler, mouvementReduit])

  return (
    <ContexteVisage.Provider value={actions}>
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="font-display text-h5 text-fg">Mon entreprise</h1>
          <p className="mt-1.5 text-sm text-fg-2">Votre profil vivant, renseigné une fois, réutilisé par chaque mémoire technique</p>
        </header>
        {!donnees.profilCharge ? (
          <MemoireSkeleton />
        ) : (
          <>
            <SceneVisage ref={visage} donnees={donnees} onChoisir={choisirDepuisBulle} />
            <RubriquesEntreprise
              donnees={donnees}
              rubrique={rubrique}
              onChoisir={choisir}
              panneaux={{
                identite: (ids) => <FormIdentite donnees={donnees} avant={<DecrireEtDeposer rubrique="identite" />} idPanneau={ids.panneau} idOnglet={ids.onglet} />,
                moyens: (ids) => <FormMoyens donnees={donnees} avant={<DecrireEtDeposer rubrique="moyens" />} idPanneau={ids.panneau} idOnglet={ids.onglet} />,
                certifications: (ids) => <FormCertifications donnees={donnees} avant={<DecrireEtDeposer rubrique="certifications" />} idPanneau={ids.panneau} idOnglet={ids.onglet} />,
              }}
            />
          </>
        )}
      </div>
    </ContexteVisage.Provider>
  )
}
