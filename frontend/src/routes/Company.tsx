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
import { AfficherPlus } from '@/components/entreprise/champs'
import { MemoireSkeleton } from '@/components/skeletons'
import { rubriqueDepuisRecherche, type RubriqueId } from '@/lib/entreprise/avancement'

// Texte libre → l'IA structure → l'utilisateur valide avant toute écriture (C7). Repliée : la saisie guidée vient d'abord.
const DecrireAvecVosMots = () => (
  <AfficherPlus libelle="Décrire avec vos mots" libelleOuvert="Masquer">
    <ProfileFreeTextCard />
  </AfficherPlus>
)

// « Mon entreprise » : le profil vivant, en trois rubriques (Identité, Moyens humains et matériels,
// Certifications et références). Un formulaire et un « Enregistrer » par rubrique ; chaque donnée reste dans
// sa table actuelle (organisation, profil mémoire, équipe, références, coffre-fort).
export default function Company() {
  // /company?rubrique=moyens (Équipe) ou =certifications (Mes références) ouvre la colonne demandée, même si l'écran est déjà affiché.
  const demandee = rubriqueDepuisRecherche(useLocation().search)
  const [rubrique, setRubrique] = useState<RubriqueId>(demandee ?? 'identite')
  useEffect(() => { if (demandee) setRubrique(demandee) }, [demandee])
  const donnees = useDonneesEntreprise()
  const visage = useRef<VisageAnimeRef>(null)
  // Choisir une rubrique (carte ou bulle) : elle s'ouvre et le visage joue l'éclair.
  const choisir = (r: RubriqueId) => { setRubrique(r); visage.current?.eclair() }
  const actions = useRef({ eclair: () => visage.current?.eclair() }).current

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
        <SceneVisage ref={visage} donnees={donnees} onChoisir={choisir} />
        <RubriquesEntreprise
          donnees={donnees}
          rubrique={rubrique}
          onChoisir={choisir}
          panneaux={{
            identite: <><DecrireAvecVosMots /><FormIdentite donnees={donnees} /></>,
            moyens: <><DecrireAvecVosMots /><FormMoyens donnees={donnees} /></>,
            certifications: <FormCertifications donnees={donnees} />,
          }}
        />
        </>
      )}
    </div>
    </ContexteVisage.Provider>
  )
}
